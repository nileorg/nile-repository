const fs = require('fs');
const path = require('path')
const IPFS = require('ipfs');

const citiesDir = path.join(__dirname, 'cities');

const getCities = () => {
  const buffer = fs.readFileSync(path.join(__dirname, 'cities.json'));
  return JSON.parse(buffer.toString('utf-8'));
};

const getStores = (cityUid) => {
  const buffer = fs.readFileSync(path.join(citiesDir, cityUid, 'stores.json'));
  return JSON.parse(buffer.toString('utf-8'));
};

(async () => {
  const ipfsNode = await IPFS.create();

  const addToIpfs = async (filename) => {
    if (!filename.startsWith(__dirname)) {
      throw new Error(`Invalid path: ${filename} is not in ${__dirname}`);
    }
    const ipfsPath = filename.slice(__dirname.length);
    const { cid } = await ipfsNode.add({
      path: ipfsPath,
      content: fs.readFileSync(filename),
    });
    const link = cid.toString();
    console.info(`✅ Added ${ipfsPath}: ${link}`);
    return link;
  };

  const addStore = async (cityUid, store) => {
    const { uid } = store;
    const link = await addToIpfs(path.join(citiesDir, cityUid, 'stores', `${uid}.json`));
    return { ...store, link };
  };

  try {
    const citiesWithLinksPromises = getCities().map(async (city) => {
      const { uid: cityUid } = city;
      const storesWithLinkPromises = getStores(cityUid).map(store => addStore(cityUid, store));
      const storesWithLinks = await Promise.all(storesWithLinkPromises);
      const storesWithLinkJson = JSON.stringify(storesWithLinks);
      fs.writeFileSync(path.join(citiesDir, cityUid, 'stores.json'), storesWithLinkJson);

      const link = await addToIpfs(path.join(__dirname, 'cities', cityUid, 'stores.json'));
      return { ...city, link };
    });

    const citiesWithLinks = await Promise.all(citiesWithLinksPromises);
    const citiesWithLinksJson = JSON.stringify(citiesWithLinks);
    const citiesFilename = path.join(__dirname, 'cities.json');
    fs.writeFileSync(citiesFilename, citiesWithLinksJson);
    await addToIpfs(citiesFilename);
  } finally {
    ipfsNode.stop();
  }
})();
