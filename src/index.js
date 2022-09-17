const getData = require("./getData.js");
const saveMap = new Map();
const stationToStation = async (station1, station2) => {
  const data =
    (
      await getData(
        `${station1}-${station2}`,
        `https://apis.gzmtr.com/app-map/metroweb/route/${encodeURIComponent(
          station1
        )}/${encodeURIComponent(station2)}`
      )
    ).businessObject?.routes[0].metro[0] || {};
  data.spend_time = Number(data.spend_time || 0);
  data.stations = data.stations || [];
  data.startStation = data.stations[0]?.station[0]?.transfer_info;
  return data;
};
const stationWaitTime = async (s1, s2, s3, lineName, terminal, tryTime) => {
  const checkLine = (startStation) => {
    return startStation === `换乘${lineName}往${terminal}方向`;
  };
  const { spend_time: w1_s12, startStation: s1_2 } = await stationToStation(
    s1,
    s2
  );
  const { spend_time: w1_s12_s23, startStation: s1_3 } = await stationToStation(
    s1,
    s3
  );
  const s23 = w1_s12_s23 - w1_s12;
  const { spend_time: w2_s23, startStation: s2_3 } = await stationToStation(
    s2,
    s3
  );
  if (!checkLine(s1_2) || !checkLine(s1_3) || !checkLine(s2_3)) {
    console.log(
      "不是同一条线",
      "目标",
      `换乘${lineName}往${terminal}方向`,
      "\t实际",
      s1_2,
      s1_3,
      s2_3
    );
    return 0;
  }
  const w2 = w1_s12 && w1_s12_s23 && w2_s23 ? w2_s23 - s23 : 0;
  if (!saveMap.get(s1).has(`${lineName}_${s2}`)) {
    saveMap.get(s1).set(`${lineName}_${s2}`, {
      line: lineName,
      next: s2,
      travelTime: w1_s12,
      waitTime: 0,
      tryTime,
    });
  }

  saveMap.get(s2).set(`${lineName}_${s3}`, {
    line: lineName,
    next: s3,
    travelTime: s23,
    waitTime: w2,
    tryTime,
  });

  return w2;
};

const tryStationWaitTime = async (stationNames, index2, lineName, terminal) => {
  let index1 = index2 - 1;
  let index3 = index2 + 1;
  let isLeft = true;
  const tryToChangeIndex = (err = 0) => {
    if (err++ > 3) {
      return false;
    }
    isLeft = !isLeft;
    if (!isLeft) {
      index1--;
      if (index1 >= 0) {
        return true;
      }
      index1 = 0;
      return tryToChangeIndex(err);
    }
    index3++;
    if (index3 < stationNames.length) {
      return true;
    }
    index3 = stationNames.length - 1;
    return tryToChangeIndex(err);
  };
  let tryTime = 0;
  do {
    if (tryTime) {
      console.log(
        "第",
        tryTime,
        "次尝试\t",
        "【",
        index1,
        stationNames[index1],
        "】→【",
        index2,
        stationNames[index2],
        "】→【",
        index3,
        stationNames[index3],
        "】"
      );
      if (tryTime >= 5) {
        console.log("失败次数过多");
        break;
      }
    }
    const waitTime = await stationWaitTime(
      stationNames[index1],
      stationNames[index2],
      stationNames[index3],
      lineName,
      terminal,
      tryTime
    );
    if (waitTime) {
      return waitTime;
    }

    tryTime++;
  } while (tryToChangeIndex(0));
  return 0;
};
const fixTerminal = (stationNames, lineName) => {
  let waitTime = 0;
  let p = 2;
  do {
    waitTime = saveMap
      .get(stationNames[p - 1])
      .get(`${lineName}_${stationNames[p]}`).waitTime;
  } while (!waitTime && ++p < stationNames.length);
  if (waitTime) {
    const obj = saveMap
      .get(stationNames[0])
      .get(`${lineName}_${stationNames[1]}`);
    if (obj) {
      obj.waitTime = waitTime;
      obj.travelTime -= waitTime;
    }
  }
};
(async () => {
  const allLines = (
    await getData(
      "allLines",
      "https://apis.gzmtr.com/app-map/metroweb/linestation"
    )
  ).businessObject.filter(({ lineShowCode }) =>
    /^[a-z]{0,2}\d*$/i.test(lineShowCode)
  );
  const lineMap = new Map();
  const fixWaitTime = () => {
    for (const [stationName, stationMap] of saveMap) {
      for (const [_, nextStation] of stationMap) {
        if (nextStation.tryTime) {
          const line = lineMap.get(nextStation.line);
          const stationIndex = line.indexOf(stationName);
          const nextStationIndex = line.indexOf(nextStation.next);
          if (Math.abs(stationIndex - nextStationIndex) !== 1) {
            const newNextStationIndex =
              stationIndex + (stationIndex > nextStationIndex ? -1 : 1);
            const newNextStation = line[newNextStationIndex];
            if (!stationMap.has(`${nextStation.line}_${newNextStation}`)) {
              stationMap.set(`${nextStation.line}_${newNextStation}`, {
                line: nextStation.line,
                next: newNextStation,
                travelTime:
                  nextStation.travelTime -
                  saveMap
                    .get(newNextStation)
                    .get(`${nextStation.line}_${nextStation.next}`).travelTime,
                waitTime: nextStation.waitTime,
                tryTime: 0,
              });
            }
            stationMap.delete(_);
          }
        }
        delete nextStation.tryTime;
      }
    }
  };
  for (const { lineName, stations } of allLines) {
    const terminalUp = stations[0].stationName;
    const terminalDown = stations[stations.length - 1].stationName;
    console.log(
      "正在处理",
      lineName,
      "共有车站(个):",
      stations.length,
      terminalUp,
      "<--->",
      terminalDown
    );
    const stationNamesDown = stations.map(({ stationName }) => {
      if (!saveMap.has(stationName)) {
        saveMap.set(stationName, new Map());
      }
      return stationName;
    });
    const stationNamesUp = [...stationNamesDown].reverse();
    lineMap.set(lineName, stationNamesDown);
    for (let i = 1; i < stations.length - 1; i++) {
      const w2_down = await tryStationWaitTime(
        stationNamesDown,
        i,
        lineName,
        terminalDown
      );
      // console.log(
      //   "等待时间",
      //   stationNamesDown[i],
      //   `站\t往${terminalDown}方向\t`,
      //   w2_down,
      //   "s"
      // );
      const w2_up = await tryStationWaitTime(
        stationNamesUp,
        stations.length - 1 - i,
        lineName,
        terminalUp
      );
      // console.log(
      //   "等待时间",
      //   stationNamesUp[stations.length - 1 - i],
      //   `站\t往${terminalUp}方向\t`,
      //   w2_up,
      //   "s"
      // );
    }
    fixTerminal(stationNamesDown, lineName);
    fixTerminal(stationNamesUp, lineName);
    //break;
  }
  fixWaitTime();
  console.log(saveMap);

  //   console.log(
  //     await getData(
  //       "西塱-坑口",
  //       "https://apis.gzmtr.com/app-map/metroweb/route/%E8%A5%BF%E5%A1%B1/%E5%9D%91%E5%8F%A3"
  //     )
  //   );
})();
