const { asyncHandler, ok } = require('../utils/http');
const locations = require('../services/locations');

const cacheable = (res) => res.set('Cache-Control', 'public, max-age=86400');

const getProvinces = asyncHandler(async (req, res) => {
  cacheable(res);
  return ok(res, locations.listProvinces());
});

const getDistricts = asyncHandler(async (req, res) => {
  cacheable(res);
  return ok(res, locations.listDistricts(req.query.province));
});

const getSectors = asyncHandler(async (req, res) => {
  cacheable(res);
  return ok(res, locations.listSectors(req.query.district));
});

const getCells = asyncHandler(async (req, res) => {
  cacheable(res);
  return ok(res, locations.listCells(req.query.sector));
});

const getVillages = asyncHandler(async (req, res) => {
  cacheable(res);
  return ok(res, locations.listVillages(req.query.cell));
});

const getVillage = asyncHandler(async (req, res) => {
  cacheable(res);
  return ok(res, locations.resolveVillage(req.query.village || req.query.code));
});

const getHierarchy = asyncHandler(async (req, res) => {
  cacheable(res);
  return ok(res, locations.getHierarchy(req.params.code));
});

module.exports = {
  getProvinces,
  getDistricts,
  getSectors,
  getCells,
  getVillages,
  getVillage,
  getHierarchy
};
