const { MongoClient } = require('mongodb');

let client;
async function fruitsCollection() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL);
    await client.connect();
  }
  return client.db(process.env.MONGO_DB || 'onepiece').collection('fruits');
}

module.exports = { fruitsCollection };