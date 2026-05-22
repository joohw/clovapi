/**
 * @deprecated 请使用 model-adapters.testVendorModel；此处保留 flat profile 兼容入口。
 */
const { runHttpProbe } = require("./model-test-paths");

async function testProfile(profile) {
  return runHttpProbe(profile, { adapterId: "legacy-flat-profile" });
}

module.exports = {
  testProfile,
};
