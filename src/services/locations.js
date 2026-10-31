const { ApiError } = require('../utils/http');

const DATA = {
  province: require('../data/locations/provinces.json'),
  district: require('../data/locations/districts.json'),
  sector: require('../data/locations/sectors.json'),
  cell: require('../data/locations/cells.json'),
  village: require('../data/locations/villages.json')
};

const LEVELS = ['province', 'district', 'sector', 'cell', 'village'];

const CODE_PATTERNS = {
  province: /^RW-\d{2}$/,
  district: /^RW-D-\d{2}$/,
  sector: /^RW-S-\d{3}$/,
  cell: /^RW-C-\d{4}$/,
  village: /^RW-V-\d{5}$/
};

const toOption = (row) => ({ code: row[0], name: row[1] });

const levelOf = (code) => {
  const value = String(code || '').trim();
  if (!value) return null;
  return LEVELS.find((level) => CODE_PATTERNS[level].test(value)) || null;
};

const assertLevel = (code, level, field) => {
  const value = String(code || '').trim();
  if (!value || levelOf(value) !== level) {
    throw new ApiError(422, `Select a valid ${level}.`, {
      [field]: `Select a valid ${level}.`
    });
  }
  return value;
};

const indexes = {};

const byCode = (level) => {
  if (!indexes[level]) {
    indexes[level] = new Map(DATA[level].map((row) => [row[0], row]));
  }
  return indexes[level];
};

const childrenOf = (level, parentCode) =>
  DATA[level].filter((row) => row[2] === parentCode).map(toOption);

const listProvinces = () => DATA.province.map(toOption);

const listDistricts = (provinceCode) =>
  childrenOf('district', assertLevel(provinceCode, 'province', 'province'));

const listSectors = (districtCode) =>
  childrenOf('sector', assertLevel(districtCode, 'district', 'district'));

const listCells = (sectorCode) =>
  childrenOf('cell', assertLevel(sectorCode, 'sector', 'sector'));

const listVillages = (cellCode) =>
  childrenOf('village', assertLevel(cellCode, 'cell', 'cell'));

const resolveVillage = (villageCode) => {
  let cursor = assertLevel(villageCode, 'village', 'village_code');
  const chain = {};

  for (let i = LEVELS.length - 1; i >= 0; i -= 1) {
    const level = LEVELS[i];
    const row = byCode(level).get(cursor);
    if (!row) {
      throw new ApiError(422, 'Select a complete location.', {
        village_code: 'Select a complete location.'
      });
    }
    chain[level] = row;
    cursor = row[2];
  }

  if (cursor) {
    throw new ApiError(422, 'Select a complete location.', {
      village_code: 'Select a complete location.'
    });
  }

  return {
    province: chain.province[1],
    district: chain.district[1],
    sector: chain.sector[1],
    cell: chain.cell[1],
    village: chain.village[1],
    village_code: chain.village[0]
  };
};

const getHierarchy = (code) => {
  const value = String(code || '').trim();
  const level = levelOf(value);
  if (!level) {
    throw new ApiError(404, 'Location not found.');
  }

  let cursor = value;
  const chain = [];

  for (let i = LEVELS.indexOf(level); i >= 0; i -= 1) {
    const row = byCode(LEVELS[i]).get(cursor);
    if (!row) {
      throw new ApiError(404, 'Location not found.');
    }
    chain.unshift(toOption(row));
    cursor = row[2];
  }

  return chain;
};

module.exports = {
  listProvinces,
  listDistricts,
  listSectors,
  listCells,
  listVillages,
  resolveVillage,
  getHierarchy
};
