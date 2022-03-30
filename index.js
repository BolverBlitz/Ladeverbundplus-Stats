require('dotenv').config()
const request = require("request");
const Influxdb = require('influxdb-v2');
const os = require('os');
const package = require('./package.json');

const customHeaderRequest = request.defaults({
    headers: { 'User-Agent': `Ladeverbundplus-Stats/${package.version} (NodeJS_${process.env.NODE_VERSION}) ${os.platform()} (${os.arch()})` }
})

/* Create InfluxClient */
const db = new Influxdb({
    host: process.env.Influx_Host,
    protocol: process.env.Influx_Protocol,
    port: process.env.Influx_Port,
    token: process.env.Influx_Token
});

/**
 * Gets current stats from Ladeverbundplus API
 * @param {String} url 
 * @returns {ChargingStations}
 */
const getChargingStations = (url) => {
    return new Promise(function (resolve, reject) {
        customHeaderRequest(url, { json: true }, (error, response, body) => {
            if (error) {
                reject(error);
            } else {
                resolve(body.data);
            }
        });
    });
}

/**
 * Stores a Object to InfluxDB
 * @param {Object} data 
 */
const writeNewDataPoint = async (data) =>  {
    await db.write(
        {
            org: process.env.Database_Orga,
            bucket: process.env.Database_Bucket,
            precision: 's'
        },
        [{
            measurement: process.env.Database_Measurement,
            tags: { host: process.env.TagsName },
            fields: data
        }]
    );
}

/**
 * Stores a Object to InfluxDB
 */
 const ProcessData = async () =>  {
    try {
        let [StatusArray, PowerTotal, PowerUsed, TotalPlugs] = [[], 0, 0, 0];
        const Stations = await getChargingStations(process.env.URL);
        Stations.map(station => {

            station.evses.map(plug => {
                PowerTotal += plug.connectors[0].max_power;
                TotalPlugs++;

                if (plug.connectors[0].status === "CHARGING") {
                    PowerUsed += plug.connectors[0].max_power;
                }

                StatusArray.push(plug.connectors[0].status);
            });
        })

        const StationsTotal = Stations.length;
        const {AVAILABLE, CHARGING, UNKNOWN, INOPERATIVE, REMOVED, OUTOFORDER} = StatusArray.reduce(function (acc, curr) {
            return acc[curr] ? ++acc[curr] : acc[curr] = 1, acc
        }, {});

        const to_influx = {
            StationsTotal: StationsTotal,
            TotalPlugs: TotalPlugs,
            PowerTotal: PowerTotal,
            PowerUsed: PowerUsed,
            AVAILABLE: AVAILABLE,
            CHARGING: CHARGING,
            UNKNOWN: UNKNOWN,
            INOPERATIVE: INOPERATIVE,
            REMOVED: REMOVED,
            OUTOFORDER: OUTOFORDER
        }

        writeNewDataPoint(to_influx);

    } catch (e) {
        console.log(e)
    }
}

ProcessData();
setInterval(ProcessData, process.env.CheckDelayInMinutes*1000*60);