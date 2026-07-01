"use client";

import { useState } from "react";
import { countryFlag, countryIso2, countryName } from "../../lib/flags";

type CountryFlagProps = {
  country: string;
  size?: "card" | "crest" | "inline";
};

/**
 * Match data does not include federation crests, so use a real country flag
 * asset keyed by the dataset's country name. The emoji is only a graceful
 * fallback for an unavailable asset, never an abbreviation placeholder.
 */
export default function CountryFlag({ country, size = "inline" }: CountryFlagProps) {
  const [assetFailed, setAssetFailed] = useState(false);
  const iso2 = countryIso2(country);
  const label = `${countryName(country)} flag`;

  return (
    <span className={`mf-country-flag mf-country-flag-${size}`} aria-label={label} role="img">
      {!assetFailed ? (
        <img
          src={`https://flagcdn.com/w80/${iso2.toLowerCase()}.png`}
          alt=""
          width={80}
          height={53}
          loading="lazy"
          decoding="async"
          onError={() => setAssetFailed(true)}
        />
      ) : (
        <span className="mf-country-flag-fallback" aria-hidden="true">{countryFlag(country)}</span>
      )}
    </span>
  );
}
