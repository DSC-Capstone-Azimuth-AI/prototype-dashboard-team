// Synthetic ground truth (kept separate from detector output).
window.DERCONNECT_LABELS = {
 "meta": {
  "generator_version": "derconnect-campus-sim 1.0.0",
  "dataset": "campus-test",
  "seed": 4200000,
  "sampling_interval": "1h",
  "index_convention": "zero-based half-open [start, end)",
  "note": "Ground truth for evaluation only. Never used by detectors, thresholds or event priority."
 },
 "labels": [
  {
   "label_id": "L01",
   "meter": "RES-MAIN",
   "building": "RES",
   "kind": "trend_change",
   "source": "repo inject_anomaly",
   "start": 1054,
   "end": 1105,
   "severity_param": 1.319,
   "magnitude_kw": 46.7,
   "energy_kwh": 1213.0
  },
  {
   "label_id": "L02",
   "meter": "LIB-MAIN",
   "building": "LIB",
   "kind": "level_shift",
   "source": "repo inject_anomaly",
   "start": 1132,
   "end": 1155,
   "severity_param": 1.055,
   "magnitude_kw": 100.1,
   "energy_kwh": 2302.8
  },
  {
   "label_id": "L03",
   "meter": "ENG-MAIN",
   "building": "ENG",
   "kind": "hvac_contextual",
   "source": "dashboard generator",
   "start": 1136,
   "end": 1146,
   "severity_param": 1.183,
   "magnitude_kw": 17.1,
   "energy_kwh": 156.8
  },
  {
   "label_id": "L04",
   "meter": "REC-MAIN",
   "building": "REC",
   "kind": "dip",
   "source": "repo inject_anomaly",
   "start": 1141,
   "end": 1143,
   "severity_param": 3.096,
   "magnitude_kw": -191.7,
   "energy_kwh": -383.4
  },
  {
   "label_id": "L05",
   "meter": "ENG-MAIN",
   "building": "ENG",
   "kind": "dropout",
   "source": "repo inject_anomaly",
   "start": 1178,
   "end": 1185,
   "severity_param": 1.056,
   "magnitude_kw": -435.1,
   "energy_kwh": -1811.2
  },
  {
   "label_id": "L06",
   "meter": "LAB-MAIN",
   "building": "LAB",
   "kind": "variance_burst",
   "source": "repo inject_anomaly",
   "start": 1211,
   "end": 1229,
   "severity_param": 1.156,
   "magnitude_kw": 79.2,
   "energy_kwh": 130.5
  },
  {
   "label_id": "L07",
   "meter": "LIB-MAIN",
   "building": "LIB",
   "kind": "variance_burst",
   "source": "repo inject_anomaly",
   "start": 1234,
   "end": 1249,
   "severity_param": 1.204,
   "magnitude_kw": 411.2,
   "energy_kwh": 996.4
  },
  {
   "label_id": "L08",
   "meter": "ENG-PV",
   "building": "ENG",
   "kind": "pv_underperformance",
   "source": "dashboard generator",
   "start": 1464,
   "end": 1512,
   "severity_param": 1.9,
   "magnitude_kw": -15.9,
   "energy_kwh": -224.5
  },
  {
   "label_id": "L09",
   "meter": "REC-MAIN",
   "building": "REC",
   "kind": "stuck_sensor",
   "source": "repo inject_anomaly",
   "start": 1479,
   "end": 1499,
   "severity_param": 1.471,
   "magnitude_kw": 192.6,
   "energy_kwh": 2169.0
  },
  {
   "label_id": "L10",
   "meter": "RES-MAIN",
   "building": "RES",
   "kind": "reversed_segment",
   "source": "repo inject_anomaly",
   "start": 1482,
   "end": 1501,
   "severity_param": 1.305,
   "magnitude_kw": -90.5,
   "energy_kwh": -0.0
  },
  {
   "label_id": "L11",
   "meter": "ENG-MAIN",
   "building": "ENG",
   "kind": "seasonal_disruption",
   "source": "repo inject_anomaly",
   "start": 1509,
   "end": 1546,
   "severity_param": 2.1,
   "magnitude_kw": 148.2,
   "energy_kwh": 0.0
  },
  {
   "label_id": "L12",
   "meter": "STU-MAIN",
   "building": "STU",
   "kind": "overnight_load",
   "source": "dashboard generator",
   "start": 1534,
   "end": 1630,
   "severity_param": 1.151,
   "magnitude_kw": 78.9,
   "energy_kwh": 2523.9
  },
  {
   "label_id": "L13",
   "meter": "LIB-MAIN",
   "building": "LIB",
   "kind": "level_shift",
   "source": "repo inject_anomaly",
   "start": 1580,
   "end": 1626,
   "severity_param": 0.957,
   "magnitude_kw": 140.6,
   "energy_kwh": 6468.9
  },
  {
   "label_id": "L14",
   "meter": "LAB-MAIN",
   "building": "LAB",
   "kind": "seasonal_disruption",
   "source": "repo inject_anomaly",
   "start": 1688,
   "end": 1712,
   "severity_param": 1.226,
   "magnitude_kw": 75.8,
   "energy_kwh": -0.0
  },
  {
   "label_id": "L15",
   "meter": "ADM-PV",
   "building": "ADM",
   "kind": "pv_underperformance",
   "source": "dashboard generator",
   "start": 1704,
   "end": 1752,
   "severity_param": 1.504,
   "magnitude_kw": -8.2,
   "energy_kwh": -109.8
  },
  {
   "label_id": "L16",
   "meter": "REC-MAIN",
   "building": "REC",
   "kind": "hvac_contextual",
   "source": "dashboard generator",
   "start": 1712,
   "end": 1722,
   "severity_param": 2.144,
   "magnitude_kw": 104.3,
   "energy_kwh": 997.5
  },
  {
   "label_id": "L17",
   "meter": "ENG-MAIN",
   "building": "ENG",
   "kind": "trend_change",
   "source": "repo inject_anomaly",
   "start": 1729,
   "end": 1787,
   "severity_param": 1.306,
   "magnitude_kw": 68.1,
   "energy_kwh": 2008.0
  },
  {
   "label_id": "L18",
   "meter": "DCA-MAIN",
   "building": "DCA",
   "kind": "dropout",
   "source": "repo inject_anomaly",
   "start": 1786,
   "end": 1796,
   "severity_param": 1.459,
   "magnitude_kw": -581.6,
   "energy_kwh": -5679.3
  },
  {
   "label_id": "L19",
   "meter": "ADM-MAIN",
   "building": "ADM",
   "kind": "spike",
   "source": "repo inject_anomaly",
   "start": 1791,
   "end": 1792,
   "severity_param": 2.471,
   "magnitude_kw": 65.9,
   "energy_kwh": 65.9
  },
  {
   "label_id": "L20",
   "meter": "STU-MAIN",
   "building": "STU",
   "kind": "overnight_load",
   "source": "dashboard generator",
   "start": 1822,
   "end": 1942,
   "severity_param": 1.792,
   "magnitude_kw": 175.3,
   "energy_kwh": 7010.9
  },
  {
   "label_id": "L21",
   "meter": "ENG-MAIN",
   "building": "ENG",
   "kind": "time_warp",
   "source": "repo inject_anomaly",
   "start": 1823,
   "end": 1839,
   "severity_param": 1.04,
   "magnitude_kw": -62.4,
   "energy_kwh": -259.5
  },
  {
   "label_id": "L22",
   "meter": "DCA-MAIN",
   "building": "DCA",
   "kind": "time_warp",
   "source": "repo inject_anomaly",
   "start": 1876,
   "end": 1894,
   "severity_param": 0.909,
   "magnitude_kw": -42.8,
   "energy_kwh": -140.5
  },
  {
   "label_id": "L23",
   "meter": "LIB-MAIN",
   "building": "LIB",
   "kind": "dip",
   "source": "repo inject_anomaly",
   "start": 1886,
   "end": 1888,
   "severity_param": 2.136,
   "magnitude_kw": -202.3,
   "energy_kwh": -404.5
  },
  {
   "label_id": "L24",
   "meter": "LAB-MAIN",
   "building": "LAB",
   "kind": "reversed_segment",
   "source": "repo inject_anomaly",
   "start": 1907,
   "end": 1921,
   "severity_param": 2.038,
   "magnitude_kw": -207.0,
   "energy_kwh": 0.0
  },
  {
   "label_id": "L25",
   "meter": "LIB-MAIN",
   "building": "LIB",
   "kind": "stuck_sensor",
   "source": "repo inject_anomaly",
   "start": 1929,
   "end": 1950,
   "severity_param": 1.821,
   "magnitude_kw": -127.1,
   "energy_kwh": -755.3
  },
  {
   "label_id": "L26",
   "meter": "STU-MAIN",
   "building": "STU",
   "kind": "spike",
   "source": "repo inject_anomaly",
   "start": 2007,
   "end": 2008,
   "severity_param": 3.407,
   "magnitude_kw": 405.3,
   "energy_kwh": 405.3
  }
 ],
 "matches": {
  "context_regression": {
   "CR-010": {
    "label_id": "L05",
    "delay_h": 0
   },
   "CR-026": {
    "label_id": "L11",
    "delay_h": 0
   },
   "CR-027": null,
   "CR-001": {
    "label_id": "L01",
    "delay_h": 13
   },
   "CR-002": null,
   "CR-007": null,
   "CR-023": {
    "label_id": "L10",
    "delay_h": 0
   },
   "CR-025": null,
   "CR-004": {
    "label_id": "L02",
    "delay_h": 0
   },
   "CR-014": {
    "label_id": "L07",
    "delay_h": 0
   },
   "CR-030": {
    "label_id": "L13",
    "delay_h": 0
   },
   "CR-033": null,
   "CR-045": {
    "label_id": "L23",
    "delay_h": 0
   },
   "CR-049": {
    "label_id": "L25",
    "delay_h": 0
   },
   "CR-020": null,
   "CR-028": {
    "label_id": "L12",
    "delay_h": 0
   },
   "CR-029": null,
   "CR-031": null,
   "CR-032": null,
   "CR-035": null,
   "CR-042": {
    "label_id": "L20",
    "delay_h": 0
   },
   "CR-043": null,
   "CR-044": null,
   "CR-046": null,
   "CR-048": null,
   "CR-050": null,
   "CR-051": null,
   "CR-052": null,
   "CR-011": null,
   "CR-041": {
    "label_id": "L18",
    "delay_h": 0
   },
   "CR-005": {
    "label_id": "L04",
    "delay_h": 0
   },
   "CR-008": null,
   "CR-015": null,
   "CR-016": null,
   "CR-017": null,
   "CR-019": null,
   "CR-022": {
    "label_id": "L09",
    "delay_h": 0
   },
   "CR-034": null,
   "CR-039": {
    "label_id": "L16",
    "delay_h": 0
   },
   "CR-003": null,
   "CR-006": null,
   "CR-013": {
    "label_id": "L06",
    "delay_h": 7
   },
   "CR-036": {
    "label_id": "L14",
    "delay_h": 0
   },
   "CR-037": null,
   "CR-047": {
    "label_id": "L24",
    "delay_h": 0
   },
   "CR-038": {
    "label_id": "L15",
    "delay_h": 8
   },
   "CR-040": null,
   "CR-012": null,
   "CR-021": {
    "label_id": "L08",
    "delay_h": 6
   },
   "CR-024": null,
   "CR-009": null,
   "CR-018": null
  },
  "seasonal_naive_168": {
   "SW-003": null,
   "SW-006": null,
   "SW-008": null,
   "SW-011": null,
   "SW-014": null,
   "SW-018": null,
   "SW-025": null,
   "SW-027": null,
   "SW-032": null,
   "SW-023": {
    "label_id": "L18",
    "delay_h": 0
   },
   "SW-029": null,
   "SW-001": null,
   "SW-004": null,
   "SW-009": null,
   "SW-012": null,
   "SW-019": null,
   "SW-022": {
    "label_id": "L15",
    "delay_h": 9
   },
   "SW-028": null,
   "SW-030": null,
   "SW-002": null,
   "SW-005": null,
   "SW-007": null,
   "SW-010": null,
   "SW-013": null,
   "SW-015": {
    "label_id": "L08",
    "delay_h": 8
   },
   "SW-016": null,
   "SW-017": null,
   "SW-020": null,
   "SW-021": null,
   "SW-024": null,
   "SW-026": null,
   "SW-031": null
  },
  "seasonal_naive_24": {
   "SN-001": null,
   "SN-003": {
    "label_id": "L03",
    "delay_h": 0
   },
   "SN-007": {
    "label_id": "L05",
    "delay_h": 0
   },
   "SN-009": null,
   "SN-012": null,
   "SN-014": null,
   "SN-018": null,
   "SN-026": {
    "label_id": "L11",
    "delay_h": 16
   },
   "SN-028": null,
   "SN-031": null,
   "SN-032": null,
   "SN-036": null,
   "SN-041": null,
   "SN-049": null,
   "SN-010": {
    "label_id": "L07",
    "delay_h": 5
   },
   "SN-011": null,
   "SN-029": {
    "label_id": "L13",
    "delay_h": 5
   },
   "SN-030": null,
   "SN-043": {
    "label_id": "L23",
    "delay_h": 0
   },
   "SN-045": null,
   "SN-048": null,
   "SN-017": null,
   "SN-021": null,
   "SN-027": null,
   "SN-040": {
    "label_id": "L20",
    "delay_h": 0
   },
   "SN-042": null,
   "SN-047": null,
   "SN-051": null,
   "SN-035": {
    "label_id": "L18",
    "delay_h": 0
   },
   "SN-037": null,
   "SN-005": {
    "label_id": "L04",
    "delay_h": 0
   },
   "SN-006": null,
   "SN-022": {
    "label_id": "L09",
    "delay_h": 7
   },
   "SN-023": null,
   "SN-002": null,
   "SN-004": null,
   "SN-008": null,
   "SN-013": null,
   "SN-016": null,
   "SN-019": null,
   "SN-024": null,
   "SN-033": {
    "label_id": "L14",
    "delay_h": 0
   },
   "SN-039": null,
   "SN-044": {
    "label_id": "L24",
    "delay_h": 0
   },
   "SN-046": null,
   "SN-050": null,
   "SN-015": null,
   "SN-020": null,
   "SN-025": null,
   "SN-034": null,
   "SN-038": null,
   "SN-052": null
  },
  "rolling_mad": {
   "RM-020": {
    "label_id": "L18",
    "delay_h": 0
   },
   "RM-001": null,
   "RM-002": null,
   "RM-003": null,
   "RM-004": null,
   "RM-005": null,
   "RM-006": null,
   "RM-007": null,
   "RM-008": null,
   "RM-009": null,
   "RM-010": null,
   "RM-011": null,
   "RM-012": null,
   "RM-013": null,
   "RM-014": null,
   "RM-015": null,
   "RM-016": null,
   "RM-017": null,
   "RM-018": null,
   "RM-019": null,
   "RM-021": {
    "label_id": "L19",
    "delay_h": 0
   },
   "RM-022": null,
   "RM-023": null,
   "RM-024": null,
   "RM-025": null
  }
 }
};
