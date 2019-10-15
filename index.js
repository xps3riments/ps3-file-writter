const port = process.env.PORT || 3000;

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const findRemoveSync = require("find-remove");
const app = express();
const bodyParser = require("body-parser");
const saveFilePaths = "/tmp/nsx";
const MAX_FILE_AGE_SEC = 1 * 60; // max time file is persisted
const FILE_AGE_CHECK_INTERVAL = 10 * 60 * 1000; // check every 10m

function deleteOldFiles() {
  findRemoveSync(saveFilePaths, {
    age: { seconds: MAX_FILE_AGE_SEC },
    files: "*.*"
  });
}

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: false }));

app.get("/", (req, res) => {
  res.send("ps3-file-services");
});

app.get("/download", (req, res) => {
  const { resourceId, uuid } = req.query;
  const filename = path.resolve(saveFilePaths, `${uuid}-${resourceId}`);
  fs.readFile(filename, (err, data) => {
    if (err) {
      res.send({ error: "file not found" });
      return;
    }
    const { mime, contents } = JSON.parse(data);
    const contentsBuffer = Buffer.from(contents, "base64");
    res.set({
      "Content-Disposition": `attachment; filename=${resourceId}`,
      "Content-Type": mime
    });
    try {
      res.send(contentsBuffer);
      fs.unlinkSync(filename);
    } catch (e) {
      res.send({ error: e });
    }
  });
});

app.post("/upload", (req, res) => {
  const [, mime, contents] = req.body.contents.match(
    /^data:(.+?);base64,(.+)$/
  );

  const uuid = req.body.uuid;

  const resourceId = crypto
    .createHash("md5")
    .update(contents)
    .digest("hex");

  fs.writeFile(
    path.resolve(saveFilePaths, `${uuid}-${resourceId}`),
    JSON.stringify({
      contents,
      mime
    }),
    err => {
      if (err) {
        res.send({ error: err });
        return;
      }
      res.send({ resourceId });
    }
  );
});

if (!fs.existsSync(saveFilePaths)) {
  fs.mkdirSync(saveFilePaths);
}

deleteOldFiles();

// https://javascript.info/settimeout-setinterval#nested-settimeout
setTimeout(function tick() {
  deleteOldFiles();
  timerId = setTimeout(tick, FILE_AGE_CHECK_INTERVAL);
}, FILE_AGE_CHECK_INTERVAL);

app.listen(port);
