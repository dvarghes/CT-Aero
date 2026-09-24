const SHIFTS = ['Day', 'Evening', 'Night'];

function tech({ station, shift, index, team, ratings, licenses, skills, availability, hoursAlreadyWorked, maxHours = 8 }) {
  return {
    id: `${station}-${shift}-${index}`,
    name: `${station} ${shift} ${index + 1}`,
    station,
    team,
    shift,
    ratings,
    licenses,
    skills,
    availability,
    maxHours,
    hoursAlreadyWorked,
  };
}

function stationRoster(station) {
  const people = [];
  for (const shift of SHIFTS) {
    for (let index = 0; index < 4; index += 1) {
      const qualified = index < 4;
      people.push(tech({
        station,
        shift,
        index,
        team: index % 2 === 0 ? 'Line 1' : 'Line 2',
        ratings: qualified ? ['A320 family', 'A330'] : ['B737'],
        licenses: qualified ? ['B1', 'A'] : ['B2'],
        skills: qualified
          ? ['structures', 'engine', 'cabin', 'avionics']
          : ['avionics'],
        availability: 'on shift',
        hoursAlreadyWorked: index === 1 ? 8 : 2,
      }));
    }
  }
  people.push(tech({
    station,
    shift: 'Day',
    index: 4,
    team: 'Line 1',
    ratings: ['A320 family'],
    licenses: ['B1'],
    skills: ['cabin'],
    availability: 'off',
    hoursAlreadyWorked: 0,
  }));
  people.push(tech({
    station,
    shift: 'Evening',
    index: 4,
    team: 'Line 2',
    ratings: ['A320 family', 'B737'],
    licenses: ['B2'],
    skills: ['avionics'],
    availability: 'absent',
    hoursAlreadyWorked: 0,
  }));
  return people;
}

export const people = [
  ...stationRoster('HEL'),
  ...stationRoster('FRA'),
  ...stationRoster('MUC'),
];

export const defaultShifts = [
  { id: 'Day', start: '06:00', end: '14:00', role: 'B1', minimum: 4 },
  { id: 'Evening', start: '14:00', end: '22:00', role: 'B1', minimum: 3 },
  { id: 'Night', start: '22:00', end: '06:00', role: 'B1', minimum: 2 },
];

export function personName(peopleList, id) {
  return peopleList.find((person) => person.id === id)?.name ?? id;
}
