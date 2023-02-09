const fs = require("fs");
const http = require("http");
const { XML } = require("./tools/dist/node/Xml");
const node = new Map();
const way = new Map();
const relation = new Map();
let mainLat;
let mainLon;
const getZB = (lat) => {
  const o = lat.split(".");
  o[0] = Number(o[0]);
  o[1] = Number(o[1].padEnd(7, "0"));
  return o;
};
const readTag = (obj, tagName, attributes) => {
  switch (tagName) {
    case "tag":
      obj[attributes.k] = attributes.v;
      return;
    case "member":
    case "nd":
      const type = attributes.type || "node";
      if (!(type in obj)) {
        obj[type] = [];
      }
      obj[type].push(Number(attributes.ref));
      return;
  }
};
XML.parseArray(String(fs.readFileSync("sk.xml"))).children.forEach(
  ({ tagName, attributes, children }) => {
    if (!attributes.id) {
      return;
    }
    const obj = {};
    children.forEach((child) => readTag(obj, child.tagName, child.attributes));
    switch (tagName) {
      case "node":
        const lat = getZB(attributes.lat);
        const lon = getZB(attributes.lon);
        if (mainLat === undefined && mainLon === undefined) {
          mainLat = lat[0];
          mainLon = lon[0];
        }
        obj.lat = (lat[0] - mainLat) * 1e7 + lat[1];
        obj.lon = (lon[0] - mainLon) * 1e7 + lon[1];
        node.set(Number(attributes.id), obj);
        return;
      case "way":
        way.set(Number(attributes.id), obj);
        return;
      case "relation":
        relation.set(Number(attributes.id), obj);
        return;
    }
  }
);
//console.log(node, way, relation);

for (const [id, v] of relation) {
  if (v.route === "subway") {
    v.node = v.node.map(node.get.bind(node)).filter((a) => a);
    v.way = v.way.map(way.get.bind(way)).filter((a) => a);
    v.way.forEach((a) => {
      a.node = a.node.map(node.get.bind(node)).filter((a) => a);
    });
    console.log(v);
  }
}
setTimeout(() => {}, 1e7);
// http.request("http://www.overpass-api.de/api/interpreter",{ method: "POST",

// headers: { "Content-Type": "application/x-www-form-urlencoded" }},res=>{
//   res.pipe(fs.createWriteStream("1.json"))
// }).end(`<osm-script output="json">
// <area-query ref="3600911844"/>
// <query type="relation">
//     <has-kv k="route" v="subway"/>
// </query>
// <union>
//     <recurse type="relation-way"/>
//     <recurse type="way-node"/>
//     <recurse type="node-way"/>
//     <recurse type="way-relation"/>
// </union>
// <print/>
// </osm-script>`)
