const {
  getAllProvinces,
  getDistrictsByProvince,
  getSectorsByDistrict,
  getCellsBySector,
  getVillagesByCell,
  getByCode,
  getCodeLevel,
  getFullHierarchy
} = require('rwanda-geo');
const { ApiError } = require('../utils/http');

const toOption = (unit) => ({ code: unit.code, name: unit.name });

const assertLevel = (code, level, field) => {
  const value = String(code || '').trim();
  if (!value || getCodeLevel(value) !== level) {
    throw new ApiError(422, `Select a valid ${level}.`, {
      [field]: `Select a valid ${level}.`
    });
  }
  return value;
};

const listProvinces = () => getAllProvinces().map(toOption);

const listDistricts = (provinceCode) =>
  getDistrictsByProvince(assertLevel(provinceCode, 'province', 'province')).map(toOption);

const listSectors = (districtCode) =>
  getSectorsByDistrict(assertLevel(districtCode, 'district', 'district')).map(toOption);

const listCells = (sectorCode) =>
  getCellsBySector(assertLevel(sectorCode, 'sector', 'sector')).map(toOption);

const listVillages = (cellCode) =>
  getVillagesByCell(assertLevel(cellCode, 'cell', 'cell')).map(toOption);

const resolveVillage = (villageCode) => {
  const code = assertLevel(villageCode, 'village', 'village_code');
  const chain = getFullHierarchy(code);

  if (chain.length !== 5) {
    throw new ApiError(422, 'Select a complete location.', {
      village_code: 'Select a complete location.'
    });
  }

  const [province, district, sector, cell, village] = chain;

  return {
    province: province.name,
    district: district.name,
    sector: sector.name,
    cell: cell.name,
    village: village.name,
    village_code: village.code
  };
};

const getHierarchy = (code) => {
  const value = String(code || '').trim();
  if (!value || !getByCode(value)) {
    throw new ApiError(404, 'Location not found.');
  }
  return getFullHierarchy(value).map(toOption);
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
