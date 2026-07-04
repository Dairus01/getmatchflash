export type CountryCode = string;

const COUNTRIES: Record<string, { code: CountryCode; name: string }> = {
  ARG: { code: "ARG", name: "Argentina" }, AUS: { code: "AUS", name: "Australia" }, AUT: { code: "AUT", name: "Austria" },
  BEL: { code: "BEL", name: "Belgium" }, BRA: { code: "BRA", name: "Brazil" }, CAN: { code: "CAN", name: "Canada" },
  CPV: { code: "CPV", name: "Cape Verde" }, CIV: { code: "CIV", name: "Ivory Coast" }, COL: { code: "COL", name: "Colombia" },
  COD: { code: "COD", name: "Congo DR" }, HRV: { code: "HRV", name: "Croatia" }, ECU: { code: "ECU", name: "Ecuador" },
  EGY: { code: "EGY", name: "Egypt" }, ENG: { code: "ENG", name: "England" }, FRA: { code: "FRA", name: "France" },
  DEU: { code: "DEU", name: "Germany" }, GHA: { code: "GHA", name: "Ghana" }, JPN: { code: "JPN", name: "Japan" },
  MAR: { code: "MAR", name: "Morocco" }, MEX: { code: "MEX", name: "Mexico" }, NLD: { code: "NLD", name: "Netherlands" },
  NOR: { code: "NOR", name: "Norway" }, PRT: { code: "PRT", name: "Portugal" }, SEN: { code: "SEN", name: "Senegal" },
  ZAF: { code: "ZAF", name: "South Africa" }, ESP: { code: "ESP", name: "Spain" }, SWE: { code: "SWE", name: "Sweden" },
  CHE: { code: "CHE", name: "Switzerland" }, DZA: { code: "DZA", name: "Algeria" }, USA: { code: "USA", name: "United States" },
  BIH: { code: "BIH", name: "Bosnia and Herzegovina" }, PRY: { code: "PRY", name: "Paraguay" },
};

const ALIASES: Record<string, CountryCode> = {
  "cape verde": "CPV", "congo dr": "COD", "democratic republic of the congo": "COD", "ivory coast": "CIV",
  "côte d'ivoire": "CIV", "south africa": "ZAF", "united states": "USA", usa: "USA",
};

const FLAG_CODES: Record<CountryCode, string> = {
  ARG: "AR", AUS: "AU", AUT: "AT", BEL: "BE", BRA: "BR", CAN: "CA", CPV: "CV", CIV: "CI", COL: "CO", COD: "CD",
  HRV: "HR", ECU: "EC", EGY: "EG", ENG: "GB", FRA: "FR", DEU: "DE", GHA: "GH", JPN: "JP", MAR: "MA", MEX: "MX",
  NLD: "NL", NOR: "NO", PRT: "PT", SEN: "SN", ZAF: "ZA", ESP: "ES", SWE: "SE", CHE: "CH", DZA: "DZ", USA: "US", BIH: "BA", PRY: "PY",
};

export function countryCode(country: string): CountryCode {
  const normalized = country.trim().toLowerCase();
  return ALIASES[normalized] ?? Object.values(COUNTRIES).find((item) => item.name.toLowerCase() === normalized)?.code ?? "UNK";
}

export function countryName(country: string): string {
  const code = countryCode(country);
  return COUNTRIES[code]?.name ?? country;
}

export function countryIso2(country: string): string {
  const code = countryCode(country);
  return FLAG_CODES[code] ?? "un";
}

export function countryFlag(country: string): string {
  const code = countryCode(country);
  if (code === "UNK") return "🏳️";
  return (FLAG_CODES[code] ?? code.slice(0, 2)).split("").map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
}
