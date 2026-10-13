import {parseDsn, ParsedDsn} from '@soluble/dsn-parser';

/** stands for IPv6 address while DSN is parsed - parser does not know [::1] */
const IPV6_PLACEHOLDER = 'flase-ipv6-host';

/**
 * DSN parser of server accepts also IPv6 host ([::1]) and trailing slash without database (mysql://db:3306/),
 * browser must accept the same DSN
 */
export const parseConnectionDsn = (dsn: string): ReturnType<typeof parseDsn> => {
  let ipv6: string | null = null;
  const prepared = dsn.trim()
    .replace(/^([\w+.-]+:\/\/(?:[^@/?]*@)?)\[([0-9a-fA-F:.]+)\]/, (match, prefix: string, address: string) => {
      ipv6 = address;
      return prefix + IPV6_PLACEHOLDER;
    })
    .replace(/^([\w+.-]+:\/\/[^/?]+)\/(?=\?|$)/, '$1');
  const parsed = parseDsn(prepared);
  if (parsed.success && ipv6 !== null && parsed.value.host === IPV6_PLACEHOLDER) {
    return {...parsed, value: {...parsed.value, host: ipv6} as ParsedDsn};
  }
  return parsed;
};

export const parseConnectionDsnOrThrow = (dsn: string): ParsedDsn => {
  const parsed = parseConnectionDsn(dsn);
  if (!parsed.success) {
    throw new Error(`Can't parse dsn: ${parsed.message} (${parsed.reason})`);
  }
  return parsed.value;
};
