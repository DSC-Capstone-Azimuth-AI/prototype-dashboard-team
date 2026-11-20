/* Synthetic export fixture. Meter IDs and the DST calendar are real; all values are invented. */
const model = 'chronos2-ft-5k';
const meters = ['E2451', 'E3020', 'E3510', 'E7080', 'E7085'];
const files = Object.fromEntries(['forecasts', 'predictions', 'events'].map(name => [name, model + '-' + name + '.csv']));

function bundle() {
  const shared = 'meter,time_local,time_utc,model,actual_kw';
  const forecasts = [shared + ',q01,q05,q10,q20,q30,q40,q50,q60,q70,q80,q90,q95,q99'];
  const predictions = [shared + ',score,threshold,flag,period,filled'];
  const events = ['event_id,meter,model,start,end,start_utc,end_utc,duration_h,peak_time,peak_score,peak_actual_kw,peak_expected_kw,direction'];
  const hours = [
    ['02-28 23', '03-01 07', 22, '0.25,0.125,1,calibration,False'],
    ['03-01 00', '03-01 08', 55, '2.5,0.125,1,detection,False'],
    ['03-01 01', '03-01 09', 17, '0.0,0.125,0,detection,False'],
    ['03-01 02', '03-01 10', 16, '0.0,0.125,0,detection,False'],
    ['03-08 01', '03-08 09', 15, '0.0,0.125,0,detection,False'],
    ['03-08 02', '', 14, '0.0,0.125,0,detection,True'],
    ['03-08 03', '03-08 10', 13, '0.0,0.125,0,detection,True'],
    ['03-08 04', '03-08 11', '', ',,,detection,False'],
    ['03-08 05', '03-08 12', 0, '0.0,0.125,0,detection,False'],
  ];
  const timestamp = hour => hour ? '2026-' + hour + ':00:00' : '';
  const utc = hour => hour ? timestamp(hour) + '+00:00' : '';
  for (const meter of meters) {
    const points = hours.map(([local, time, actual, prediction]) => {
      const common = [meter, timestamp(local), utc(time), model, actual].join(',');
      return [common + ',4,6,8,10,12,14,16,18,20,22,24,26,28', common + ',' + prediction];
    });
    forecasts.push(...points.map(point => point[0]));
    predictions.push(...points.toReversed().map(point => point[1]));
    if (meter !== 'E7085') events.push([meter + '-test-event', meter, model, timestamp('03-01 00'), timestamp('03-01 01'),
      utc('03-01 08'), utc('03-01 09'), '1', timestamp('03-01 00'), '2.5', '55', '16', 'above'].join(','));
  }
  return Object.fromEntries(Object.entries({ forecasts, predictions, events }).map(([name, lines]) => [name, lines.join('\n') + '\n']));
}

module.exports = { bundle, files, meters };
