/**
 * Where each surveyor starts and ends the day, so the first survey counts
 * the drive from home and the last the drive back. Areas only (the repo is
 * public): the middle of the village or district, close enough for drive
 * times. Scott has none set, so his days start at his first survey.
 */
export const HOMES = {
  ben: { area: 'West Malling', lat: 51.2937, lon: 0.4104 },
  ronnie: { area: 'West Malling', lat: 51.2937, lon: 0.4104 },
  tom: { area: "Shooter's Hill", lat: 51.4685, lon: 0.0730 }
};

export const homeOf = (surveyor) => HOMES[surveyor] || null;
