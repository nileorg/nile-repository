const fs = require('fs');
const path = require('path')
const IPFS = require('ipfs');
const fetch = require('node-fetch');

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

  let succeeding = true;

  try {
    const citiesWithLinksPromises = getCities().map(async (city) => {
      const { uid: cityUid } = city;
      const storesWithLinksPromises = getStores(cityUid).map(store => addStore(cityUid, store));
      const storesWithLinks = await Promise.all(storesWithLinksPromises);
      const storesWithLinksJson = JSON.stringify(storesWithLinks);
      fs.writeFileSync(path.join(citiesDir, cityUid, 'stores.json'), storesWithLinksJson);

      const link = await addToIpfs(path.join(__dirname, 'cities', cityUid, 'stores.json'));
      return { ...city, link };
    });

    const citiesWithLinks = await Promise.all(citiesWithLinksPromises);
    const citiesWithLinksJson = JSON.stringify(citiesWithLinks);
    const citiesFilename = path.join(__dirname, 'cities.json');
    fs.writeFileSync(citiesFilename, citiesWithLinksJson);
    const citiesLink = await addToIpfs(citiesFilename);

    console.info('🚀 Triggering Github actions for updating client hash');
    const response = await fetch(
      'https://api.github.com/repos/nileorg/nile-client-lite/dispatches',
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.everest-preview+json',
          Authorization: `token ${process.env.NILE_CLIENT_GITHUB_TOKEN}`,
        },
        body: JSON.stringify({
          event_type: 'update_hash',
          client_payload: {
            hash: citiesLink,
          },
        }),
      },
    );
    succeeding = response.ok;
    console.info(
response.ok
        ? '✅ Triggered'
        : `❌ Failed: ${response.status} - ${response.statusText}`
    );
    console.debug(await response.json());
  } catch (error) {
    console.error(error);
    succeeding = false;
  } finally {
    ipfsNode.stop();
    process.exit(succeeding ? 0 : 1);
  }
})();
