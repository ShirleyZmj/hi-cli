const program = require("commander");
const path = require("path");
const { version, cliName } = require("./const");

const actionsMap = {
  create: {
    description: "create project",
    alias: "cr",
    examples: [`${cliName} create <template-name>`],
  },
  "*": {
    alias: "",
    description: `command not found, please use \n ${cliName} --help`,
  },
};

Object.keys(actionsMap).forEach((action) => {
  program
    .command(action)
    .alias(actionsMap[action].alias)
    .description(actionsMap[action].description)
    .action(() => {
      if (action === "*") {
        console.log(actionsMap[action].description);
      } else {
        const argv = process.argv.slice(3);
        // 当使用create命令，获取用户输入后，当作参数调用 lib/create.js
        // 这时候我们关注create.js文件即可
        require(path.resolve(__dirname, `lib/${action}`))(...argv);
      }
    });
});

program.on("--help", () => {
  console.log("\n Examples");
  Object.keys(actionsMap).forEach((action) => {
    (actionsMap[action].examples || []).forEach((example) => {
      console.log(`  ${example}`);
    });
  });
});

program.version(version).parse(process.argv);
