const fs = require("fs");
const https = require("https");

const proxyPath = "";

module.exports = (fileName, url) =>
  new Promise((r) => {
    const { host } = new URL(url);
    fileName = `../cache/${host}/${fileName}.json`;
    fs.readFile(fileName, (err, data) => {
      if (data && String(data)) {
        r(JSON.parse(String(data)));
        return;
      }
      console.log("正在请求", url);
      fs.mkdir(`../cache/${host}/`, () => {});
      https
        .request(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Referer: "https://www.gzmtr.com/",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36",
            },
          },
          (res) => {
            const body = [];
            res.on("data", (chuck) => body.push(chuck));
            res.on("end", () => {
              fs.writeFile(fileName, Buffer.concat(body), (d) => d);
              r(JSON.parse(String(Buffer.concat(body))));
            });
          }
        )
        .end();
    });
  });
