/** spatial values of results as GeoJSON-like geometries */

export type PositionType = [number, number];

export type GeometryType =
  | {type: 'Point', coordinates: PositionType}
  | {type: 'MultiPoint', coordinates: PositionType[]}
  | {type: 'LineString', coordinates: PositionType[]}
  | {type: 'MultiLineString', coordinates: PositionType[][]}
  | {type: 'Polygon', coordinates: PositionType[][]}
  | {type: 'MultiPolygon', coordinates: PositionType[][][]}
  | {type: 'GeometryCollection', geometries: GeometryType[]};

/** column types holding geometries - MySQL / MariaDB, PostGIS, PostgreSQL geometric types */
export const SPATIAL_TYPE = /^(geometry|geography|point|linestring|polygon|multipoint|multilinestring|multipolygon|geometrycollection|geomcollection|lseg|box|path|circle)\b/i;

const isXY = (value: any): boolean => value && typeof value === 'object' && typeof value.x === 'number' && typeof value.y === 'number';
const xy = (value: any): PositionType => [value.x, value.y];

/** geometry as parsed by mysql driver - {x, y}, arrays of them; type of column decides between ambiguous shapes */
const fromMysql = (value: any, type: string): GeometryType | null => {
  if (isXY(value)) return {type: 'Point', coordinates: xy(value)};
  if (!Array.isArray(value)) return null;
  const kind = type.toLowerCase();
  if (/collection/.test(kind)) {
    const geometries = value.map((item) => fromMysql(item, 'geometry')).filter((item): item is GeometryType => !!item);
    return {type: 'GeometryCollection', geometries};
  }
  if (value.every(isXY)) {
    return /multipoint/.test(kind) ? {type: 'MultiPoint', coordinates: value.map(xy)} : {type: 'LineString', coordinates: value.map(xy)};
  }
  if (value.every((item) => Array.isArray(item) && item.every(isXY))) {
    const rings = value.map((item) => item.map(xy));
    return /multilinestring/.test(kind) ? {type: 'MultiLineString', coordinates: rings} : {type: 'Polygon', coordinates: rings};
  }
  if (value.every((item) => Array.isArray(item) && item.every((ring: any) => Array.isArray(ring) && ring.every(isXY)))) {
    return {type: 'MultiPolygon', coordinates: value.map((polygon) => polygon.map((ring: any[]) => ring.map(xy)))};
  }
  return null;
};

/** POINT(1 2), MULTIPOLYGON(((...))), SRID=4326;POINT Z (1 2 3) */
export const parseWkt = (text: string): GeometryType | null => {
  const source = text.trim().replace(/^SRID=\d+;/i, '');
  let position = 0;
  const skip = () => {
    while (position < source.length && /\s/.test(source[position])) position++;
  };
  const word = (): string => {
    skip();
    const match = /^[A-Za-z]+/.exec(source.slice(position));
    position += match ? match[0].length : 0;
    return match ? match[0].toUpperCase() : '';
  };
  const expect = (char: string) => {
    skip();
    if (source[position] !== char) throw new Error(`Expected ${char}`);
    position++;
  };
  const peek = (char: string) => {
    skip();
    return source[position] === char;
  };
  const point = (): PositionType => {
    skip();
    const match = /^(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)(\s+-?[\d.eE+-]+)*/.exec(source.slice(position));
    if (!match) throw new Error('Expected coordinates');
    position += match[0].length;
    return [Number(match[1]), Number(match[2])];
  };
  const list = <T>(item: () => T): T[] => {
    expect('(');
    const items = [item()];
    while (peek(',')) {
      position++;
      items.push(item());
    }
    expect(')');
    return items;
  };
  // MULTIPOINT(1 2, 3 4) and MULTIPOINT((1 2), (3 4))
  const multiPoint = () => peek('(') ? (() => { expect('('); const value = point(); expect(')'); return value; })() : point();

  const geometry = (): GeometryType => {
    const type = word();
    // dimension flags Z, M, ZM
    const flag = /^(ZM|Z|M)\b/i.exec(source.slice(position).trim());
    if (flag) {
      skip();
      position += flag[0].length;
    }
    if (word() === 'EMPTY') throw new Error('Empty');
    switch (type) {
      case 'POINT': {
        expect('(');
        const value = point();
        expect(')');
        return {type: 'Point', coordinates: value};
      }
      case 'LINESTRING': return {type: 'LineString', coordinates: list(point)};
      case 'POLYGON': return {type: 'Polygon', coordinates: list(() => list(point))};
      case 'MULTIPOINT': return {type: 'MultiPoint', coordinates: list(multiPoint)};
      case 'MULTILINESTRING': return {type: 'MultiLineString', coordinates: list(() => list(point))};
      case 'MULTIPOLYGON': return {type: 'MultiPolygon', coordinates: list(() => list(() => list(point)))};
      case 'GEOMETRYCOLLECTION': return {type: 'GeometryCollection', geometries: list(geometry)};
      default: throw new Error(`Unknown geometry ${type}`);
    }
  };
  try {
    if (!/^(SRID=\d+;)?\s*(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\b/i.test(text.trim())) return null;
    const result = geometry();
    skip();
    return position === source.length ? result : null;
  } catch (e) {
    return null;
  }
};

/** PostgreSQL geometric types in text form */
const fromPostgres = (text: string, type: string): GeometryType | null => {
  const numbers = (text.match(/-?\d+(\.\d+)?(e[+-]?\d+)?/gi) || []).map(Number);
  const pairs: PositionType[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) pairs.push([numbers[index], numbers[index + 1]]);
  const kind = type.toLowerCase();
  if (kind.startsWith('point') && pairs.length === 1) return {type: 'Point', coordinates: pairs[0]};
  if (kind.startsWith('lseg') && pairs.length === 2) return {type: 'LineString', coordinates: pairs};
  if (kind.startsWith('box') && pairs.length === 2) {
    const [[x1, y1], [x2, y2]] = pairs;
    return {type: 'Polygon', coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]]};
  }
  if (kind.startsWith('path') && pairs.length >= 2) {
    // ( ) closed path, [ ] open path
    return text.trim().startsWith('(') ? {type: 'Polygon', coordinates: [[...pairs, pairs[0]]]} : {type: 'LineString', coordinates: pairs};
  }
  if (kind.startsWith('polygon') && pairs.length >= 3) return {type: 'Polygon', coordinates: [[...pairs, pairs[0]]]};
  if (kind.startsWith('circle') && numbers.length === 3) {
    const [x, y, radius] = numbers;
    const ring: PositionType[] = Array.from({length: 33}, (item, index) => [x + radius * Math.cos((index / 32) * 2 * Math.PI), y + radius * Math.sin((index / 32) * 2 * Math.PI)]);
    return {type: 'Polygon', coordinates: [ring]};
  }
  return null;
};

const fromGeoJson = (value: any): GeometryType | null => {
  if (!value || typeof value !== 'object' || typeof value.type !== 'string') return null;
  if (value.type === 'Feature') return fromGeoJson(value.geometry);
  if (value.type === 'GeometryCollection' && Array.isArray(value.geometries)) {
    return {type: 'GeometryCollection', geometries: value.geometries.map(fromGeoJson).filter((item: any): item is GeometryType => !!item)};
  }
  if (['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(value.type) && Array.isArray(value.coordinates)) {
    return {type: value.type, coordinates: value.coordinates} as GeometryType;
  }
  return null;
};

/** geometry of cell value, null when value is not spatial */
export const parseGeometry = (value: any, type: string = ''): GeometryType | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return fromGeoJson(value) || fromMysql(value, type);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (/^(SRID=\d+;)?[A-Za-z]/.test(text)) return parseWkt(text);
  if (text.startsWith('{')) {
    try {
      return fromGeoJson(JSON.parse(text));
    } catch (e) {
      return null;
    }
  }
  if (/^[([<]/.test(text) && SPATIAL_TYPE.test(type)) return fromPostgres(text, type);
  return null;
};

/** all positions of geometry */
export const positionsOf = (geometry: GeometryType): PositionType[] => {
  switch (geometry.type) {
    case 'Point': return [geometry.coordinates];
    case 'MultiPoint':
    case 'LineString': return geometry.coordinates;
    case 'MultiLineString':
    case 'Polygon': return geometry.coordinates.flat();
    case 'MultiPolygon': return geometry.coordinates.flat(2);
    case 'GeometryCollection': return geometry.geometries.flatMap(positionsOf);
  }
};
