const axios = require("axios");
const path = require("path");
const chalk = require("chalk");
const ora = require("ora");
const fs = require("fs");
const Inquirer = require("inquirer");
const { promisify } = require("util");
const { token, url, clonePre, downloadDirectory } = require("../const");
const MetalSmith = require("metalsmith"); // 遍历文件夹 找需不需要渲染
let { render } = require("consolidate").ejs;
render = promisify(render);

let downLoadGit = require("download-git-repo");
downLoadGit = promisify(downLoadGit);
let ncp = require("ncp");
ncp = promisify(ncp);

class Creator {
  // 从拿到create命令的projectName参数开始
  constructor(projectName) {
    this.projectName = projectName;
  }

  async create() {
    // 1.判断当前目录下是否有重名文件
    const currentPath = path.resolve(this.projectName);

    const continued = await this.checkFileExistAndIfOverwrite(currentPath);
    if (!continued) {
      console.log(chalk.cyan("Nothing happened, bye"));
      return;
    }

    // 2.获取当前组织下的所有仓库列表
    const repos = await this.wrapFetchAddLoding(
      this.fetchRepoList,
      "fetching repo list"
    )();

    // 3.用户选择需要下载的模板仓库
    const templates = repos
      .map((item) => ({
        name: item.name,
        value: `${item.name}_${item.id}`,
      }))
      .filter((item) => item.name.includes("template"));

    const { template } = await Inquirer.prompt({
      name: "template",
      type: "list",
      message: "please choose template to create project",
      choices: templates, // 选择模式
    });

    let [templateName, templateId] = template.split("_");

    // 4.决定是依据标签还是分支来获取具体版本代码
    const { type } = await Inquirer.prompt({
      name: "type",
      type: "list",
      message: "Which resource do you want, branches or tags",
      choices: [
        {
          name: "branches",
          value: "branches",
        },
        {
          name: "tags",
          value: "tags",
        },
      ], // 选择模式, // 选择模式
    });

    // 5.根据选择结果获取资源列表，
    let resources = await this.wrapFetchAddLoding(
      this.fetchRepoResourceList,
      `fetching ${type} list`
    )(templateId, type);

    // 可能是tag列表，或者是分支列表
    resources = resources.map((item) => item.name);

    const { resource } = await Inquirer.prompt({
      name: "resource",
      type: "list",
      message: "please choose template to create project",
      choices: resources, // 选择模式
    });

    // 6.选定资源模板后进行下载,会判断是否下载过该模板
    const result = await this.download(templateName, resource);

    console.log("downloaded in\n", result);

    // 7.模板下载完成后,获取用户定制化参数,渲染模板,并在当前目录生成新项目
    try {
      await this.renderTemplate(result, currentPath);
      console.log(
        chalk.green(
          `Your project has been created successfully in ${currentPath}`
        )
      );
    } catch (e) {
      console.log(chalk.red("error", e));
    }
  }

  // 获取仓库列表
  async fetchRepoList() {
    const { data } = await axios.get(url, {
      headers: {
        "PRIVATE-TOKEN": token,
      },
    });
    return data;
  }

  // type: tags | branches
  async fetchRepoResourceList(id, type) {
    const { data } = await axios.get(`${url}/${id}/repository/${type}/`, {
      headers: {
        "PRIVATE-TOKEN": token,
      },
    });
    return data;
  }

  // 下载项目
  async copyToMyProject(currentPath) {
    await ncp(target, currentPath);
  }

  // 判断当前文件夹下是否有重名文件，如果有则咨询是否覆盖，覆盖则删掉原有的目录
  async checkFileExistAndIfOverwrite(dest) {
    if (fs.existsSync(dest)) {
      const { action } = await Inquirer.prompt([
        {
          name: "action",
          type: "list",
          message: "File exists, do you want to overwrite or cancel?",
          choices: [
            {
              name: "overwrite",
              value: "overwrite",
            },
            {
              name: "cancel",
              value: false,
            },
          ],
        },
      ]);
      if (action === "overwrite") {
        console.log(chalk.yellow("Removing the file..."));
        fs.rmSync(dest, { recursive: true });
        return true;
      } else {
        return false;
      }
    }
    return true;
  }

  // 用克隆的方式从gitlab下载项目
  async download(template, resource) {
    let api = `${clonePre}/${template}${resource ? "#" + resource : ""}`;
    const dest = `${downloadDirectory}/${template}#${resource}`; // 将模板下载到对应的目录中

    // 判断是否已经下载过该模板
    const continued = await this.checkFileExistAndIfOverwrite(dest);

    // 如果没有删除，则停止后续下载操作。
    if (!continued) return dest;

    await this.wrapFetchAddLoding(downLoadGit, "Downloading the template")(
      api,
      dest,
      {
        clone: true,
      }
    );

    return dest; // 返回下载目录
  }

  // 7.模板下载完成后,获取用户定制化参数,渲染模板,并在当前目录生成新项目
  async renderTemplate(result, currentPath) {
    // 7.1.下载完成后判断模板是否有ask.json文件，是的话就是带有模板需要渲染的目录
    const askFileName = "ask.json";
    const askPath = path.join(result, askFileName);

    // 如果不是带模板的项目，直接拷贝
    if (!fs.existsSync(askPath)) {
      // 将下载的文件拷贝到当前执行命令的目录下
      await this.wrapFetchAddLoding(copyToMyProject, currentPath);
    } else {
      // 7.2.是的话则根据json文件获取用户定制化参数
      await new Promise((resovle, reject) => {
        MetalSmith(__dirname) // 如果你传入路径 他默认会遍历当前路径下的src文件夹
          .source(result)
          .destination(currentPath)
          .use(async (files, metal, done) => {
            // 根据ask.json询问用户
            const args = require(askPath);
            const result = await Inquirer.prompt(args);
            const data = metal.metadata();
            Object.assign(data, result);
            // 删掉复制项目的ask.json文件
            delete files[askFileName];
            done();
          })
          .use((files, metal, done) => {
            const data = metal.metadata();
            Reflect.ownKeys(files).forEach(async (file) => {
              // 根据项目需求过滤你需要渲染的模板
              if (
                file.includes(".js") ||
                file.includes(".json") ||
                file.includes(".env") ||
                file.includes(".md")
              ) {
                let content = files[file].contents.toString(); // 文件的内容
                if (content.includes("<%")) {
                  content = await render(content, data);
                  files[file].contents = Buffer.from(content); // 渲染
                }
              }
            });
            // 根据用户的输入 下载模板
            done();
          })
          .build((err) => {
            if (err) {
              reject(err);
            } else {
              resovle();
            }
          });
      });
    }
  }

  // 对于promise函数，在开始时候开启loading提示，更用户友好
  wrapFetchAddLoding(fn, message) {
    return async (...args) => {
      const spinner = ora(message);
      spinner.start(); // 开始loading
      let r;
      try {
        r = await fn(...args);
        spinner.succeed(); // 结束loading
      } catch (e) {
        spinner.fail(); // 结束loading
      }
      return r;
    };
  }
}

module.exports = async (projectName) => {
  const creator = new Creator(projectName);
  creator.create();
};
