"""
Generate a synthetic July KSA workbook for multi-month ERCMP testing.

Samples crews / parishes / feeders / notes from JUNE - KSA.xlsx, then writes
data/JULY - KSA.xlsx with the same header layout and July 2026 timestamps.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import Workbook, load_workbook

ROOT = Path(__file__).resolve().parents[1]
JUNE = ROOT / "JUNE - KSA.xlsx"
OUT = ROOT / "data" / "JULY - KSA.xlsx"
ROW_COUNT = 4200
SEED = 202607

HEADERS = [
    "Job Type",
    "Job",
    "Order No.",
    "Crew",
    "Parish",
    "Order Status",
    "Device",
    "Feeder",
    "Creation Time",
    "Assigned Time",
    "Acknowlege Time",
    "Enroute Time",
    "On-Site Time",
    "Actual Comp. Time",
    "Comp. Time",
    "Final Comp. Time",
    "Hazard List",
    "Tree Contact",
    "Weather Condition",
    "Phase Change",
    "Technician Notes",
]

NOTE_POOL = [
    "Replaced blown fuse on secondary; voltage restored to normal",
    "Tree limb cleared from primary; feeder re-energized",
    "Premises found okay related to outage",
    "Replaced damaged jumper and reconnected service",
    "Patrolled feeder found temporary fault cleared",
    "Customer side issue advised; no utility defect",
    "Replaced 3 one bolt clamps on the pothead",
    "Found okay at meter voltage readings within range",
    "Isolated section repaired conductor and restored",
    "Weather related trip; reset and monitored",
]


def fmt_stamp(dt: datetime) -> str:
    hour12 = dt.hour % 12 or 12
    ap = "am" if dt.hour < 12 else "pm"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year} {hour12}:{dt.minute:02d}{ap}"


def weighted_choice(rng: random.Random, pairs: list[tuple[object, int]]):
    total = sum(w for _, w in pairs)
    pick = rng.randrange(total)
    running = 0
    for value, weight in pairs:
        running += weight
        if pick < running:
            return value
    return pairs[-1][0]


def sample_june():
    wb = load_workbook(JUNE, read_only=True, data_only=True)
    ws = wb["sheet1"]
    crews: dict[str, int] = {}
    parishes: dict[str, int] = {}
    feeders: dict[str, int] = {}
    devices: list[str] = []
    hazards: dict[str, int] = {}
    notes: list[str] = []

    for row in ws.iter_rows(min_row=4, values_only=True):
        if row[3]:
            crews[str(row[3])] = crews.get(str(row[3]), 0) + 1
        if row[4]:
            parishes[str(row[4])] = parishes.get(str(row[4]), 0) + 1
        if row[7]:
            feeders[str(row[7])] = feeders.get(str(row[7]), 0) + 1
        if row[6]:
            devices.append(str(row[6]))
        if row[16]:
            hazards[str(row[16])] = hazards.get(str(row[16]), 0) + 1
        if row[20]:
            notes.append(str(row[20])[:160])

    return {
        "crews": list(crews.items()),
        "parishes": list(parishes.items()),
        "feeders": list(feeders.items()),
        "devices": devices or [f"Load_{i}" for i in range(100000, 100200)],
        "hazards": list(hazards.items()) or [("Fire", 1)],
        "notes": notes or NOTE_POOL,
    }


def stage_chain(rng: random.Random, assigned: datetime) -> list[datetime]:
    """Build Assigned → Ack → Enroute → On-Site → Actual Comp (+ Comp/Final)."""
    mode = rng.random()
    times = [assigned]

    if mode < 0.08:
        # Batch-stamped later stages (under 4 minutes) — field-cleaned will drop many of these.
        t = assigned + timedelta(minutes=rng.randint(5, 90))
        times.append(t)
        for _ in range(3):
            t = t + timedelta(minutes=rng.randint(0, 3), seconds=rng.randint(0, 50))
            times.append(t)
    elif mode < 0.12:
        # Negative / out-of-order blip for quality flags.
        times.append(assigned + timedelta(minutes=rng.randint(10, 40)))
        times.append(assigned - timedelta(minutes=rng.randint(20, 120)))
        times.append(assigned + timedelta(minutes=rng.randint(50, 180)))
        times.append(assigned + timedelta(minutes=rng.randint(80, 260)))
    else:
        # Normal-ish response profile (minutes).
        gaps = [
            max(1, int(rng.lognormvariate(3.2, 0.7))),  # Assigned → Ack
            max(2, int(rng.lognormvariate(3.5, 0.65))),  # Ack → Enroute
            max(4, int(rng.lognormvariate(3.0, 0.55))),  # Enroute → On-Site
            max(5, int(rng.lognormvariate(3.1, 0.6))),  # On-Site → Actual
        ]
        # Slight July slowdown vs June on acknowledge for a few parishes later.
        t = assigned
        for gap in gaps:
            t = t + timedelta(minutes=gap)
            times.append(t)

    # Comp / Final usually match Actual, sometimes a minute later.
    actual = times[-1]
    comp = actual + timedelta(minutes=rng.choice([0, 0, 0, 1, 2]))
    final = comp + timedelta(minutes=rng.choice([0, 0, 1]))
    times.extend([comp, final])
    return times


def main() -> None:
    rng = random.Random(SEED)
    pool = sample_june()
    OUT.parent.mkdir(parents=True, exist_ok=True)

    weather_weights = [
        ("Fair", 860),
        ("Rains", 80),
        ("SevereWind", 40),
        ("EarthMovement", 8),
        ("Flood", 6),
        ("LandSlide", 3),
        ("SaltSprays", 2),
        ("null", 1),
    ]

    wb = Workbook()
    ws = wb.active
    ws.title = "sheet1"
    ws.append(["Detail"])
    ws.append([])
    ws.append(HEADERS)

    start = datetime(2026, 7, 1, 0, 15)
    for i in range(ROW_COUNT):
        # Spread across 1–28 July so stage chains rarely spill into August.
        day = rng.randint(0, 27)
        hour = int(min(23, max(0, rng.gauss(13, 5))))
        minute = rng.randint(0, 59)
        created = start + timedelta(days=day, hours=hour, minutes=minute)

        assigned = created + timedelta(minutes=rng.randint(0, 25))
        stamps = stage_chain(rng, assigned)
        stamps = [min(s, datetime(2026, 7, 31, 23, 50)) for s in stamps]

        parish = weighted_choice(rng, pool["parishes"])
        # Nudge July volume toward KSAN / St.Catherine for a visible month delta.
        if rng.random() < 0.12:
            parish = rng.choice(["KSAN", "St.Catherine", "KSAS", "St.James"])

        crew = weighted_choice(rng, pool["crews"])
        feeder = weighted_choice(rng, pool["feeders"])
        device = rng.choice(pool["devices"])
        job_type = "Outage" if rng.random() < 0.62 else "Non-Outage"
        hazard = weighted_choice(rng, pool["hazards"]) if rng.random() < 0.18 else None
        tree = rng.choice([None, None, None, "Yes", "No"])
        phase = rng.choice(["No", "No", "No", "Yes"])
        weather = weighted_choice(rng, weather_weights)
        note = rng.choice(pool["notes"] if rng.random() < 0.7 else NOTE_POOL)

        job_id = f"J.E.26.07.{40000 + i}"
        order_no = f"C00{1870000 + i}"

        ws.append(
            [
                job_type,
                job_id,
                order_no,
                crew,
                parish,
                "Completed",
                device,
                feeder,
                fmt_stamp(created),
                fmt_stamp(stamps[0]),
                fmt_stamp(stamps[1]),
                fmt_stamp(stamps[2]),
                fmt_stamp(stamps[3]),
                fmt_stamp(stamps[4]),
                fmt_stamp(stamps[5]),
                fmt_stamp(stamps[6]),
                hazard,
                tree,
                weather,
                phase,
                note,
            ]
        )

    wb.save(OUT)
    print(f"Wrote {ROW_COUNT} jobs -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
