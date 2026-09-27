export type CrewTeam = 'in-house' | 'contractor'

const IN_HOUSE = new Set([
  'Eric Williams',
  'Antony Levy',
  'Andre Smith',
  'Fitzroy Turner',
  'Dwayne Cohen',
  'Derrick Grubb',
])

export function crewTeam(crew: string): CrewTeam {
  return IN_HOUSE.has(crew) ? 'in-house' : 'contractor'
}
