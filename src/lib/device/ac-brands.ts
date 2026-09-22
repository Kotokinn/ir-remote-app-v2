// Brand → IRremoteESP8266 protocol variants the hub firmware can send. `sendAc`'s `protocol` must be
// the exact protocol name (firmware: strToDecodeType), and the device sends only that one protocol
// per command — it never tries the others itself. One brand often encodes several different ways,
// so pairing an AC means the APP sends each variant of the chosen brand in turn until the unit
// reacts. Only protocols the firmware's IRac can build are listed (docs/MQTT_API.md "sendAc");
// the others (e.g. SAMSUNG, MIDEA24, DAIKIN200) are rejected with "AC protocol not supported".
export interface AcBrand {
  label: string;
  protocols: string[];
}

export const AC_BRANDS: AcBrand[] = [
  {
    label: "Daikin",
    protocols: [
      "DAIKIN",
      "DAIKIN2",
      "DAIKIN64",
      "DAIKIN128",
      "DAIKIN152",
      "DAIKIN160",
      "DAIKIN176",
      "DAIKIN216",
      "DAIKIN312",
    ],
  },
  { label: "Panasonic", protocols: ["PANASONIC_AC", "PANASONIC_AC32"] },
  { label: "LG", protocols: ["LG", "LG2"] },
  { label: "Midea", protocols: ["MIDEA"] },
  { label: "Samsung", protocols: ["SAMSUNG_AC"] },
  {
    label: "Mitsubishi",
    protocols: [
      "MITSUBISHI_AC",
      "MITSUBISHI_HEAVY_88",
      "MITSUBISHI_HEAVY_152",
      "MITSUBISHI112",
      "MITSUBISHI136",
    ],
  },
  {
    label: "Hitachi",
    protocols: [
      "HITACHI_AC",
      "HITACHI_AC1",
      "HITACHI_AC264",
      "HITACHI_AC296",
      "HITACHI_AC344",
      "HITACHI_AC424",
    ],
  },
  { label: "Haier", protocols: ["HAIER_AC", "HAIER_AC_YRW02", "HAIER_AC160", "HAIER_AC176"] },
  {
    label: "Carrier",
    protocols: ["CARRIER_AC64"],
  },
  { label: "Sharp", protocols: ["SHARP_AC"] },
  { label: "Sanyo", protocols: ["SANYO_AC", "SANYO_AC88"] },
  { label: "Toshiba", protocols: ["TOSHIBA_AC"] },
  { label: "Fujitsu", protocols: ["FUJITSU_AC"] },
  { label: "Gree", protocols: ["GREE"] },
  { label: "Coolix", protocols: ["COOLIX"] },
  { label: "Whirlpool", protocols: ["WHIRLPOOL_AC"] },
  { label: "Electra", protocols: ["ELECTRA_AC"] },
  { label: "TCL", protocols: ["TCL112AC"] },
  { label: "Trotec", protocols: ["TROTEC", "TROTEC_3550"] },
  { label: "Kelon", protocols: ["KELON"] },
  { label: "York", protocols: ["YORK"] },
];

/**
 * Accepts either an exact protocol name (what new pairings store) or a bare brand label (what
 * devices paired before this table existed stored, e.g. "Panasonic") and returns the protocol
 * name to put in `sendAc`. A bare brand falls back to its first variant.
 */
export function resolveAcProtocol(brandOrProtocol: string): string {
  if (AC_BRANDS.some((brand) => brand.protocols.includes(brandOrProtocol))) return brandOrProtocol;
  const byLabel = AC_BRANDS.find((brand) => brand.label.toLowerCase() === brandOrProtocol.toLowerCase());
  return byLabel?.protocols[0] ?? brandOrProtocol;
}
