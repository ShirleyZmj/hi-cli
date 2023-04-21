const { token, url, clonePre } = require("./private");

// 存放用户的所需要的常量
const { version, name } = require("../../package.json");

// 存储模板的位置, for macOS
const downloadDirectory = `${
  process.env[process.platform === "darwin" ? "HOME" : "USERPROFILE"]
}/.template`;

module.exports = {
  version,
  downloadDirectory,
  cliName: name,
  // private
  token,
  url,
  clonePre,
};
