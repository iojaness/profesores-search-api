const mysql = require('mysql2/promise');

// Railway expone MYSQL_URL en el servicio MySQL; se referencia desde las variables del microservicio.
const url = process.env.MYSQL_URL || process.env.DATABASE_URL;

const opciones = { waitForConnections: true, connectionLimit: 5, charset: 'utf8mb4' };

module.exports = url
  ? mysql.createPool({ uri: url, ...opciones })
  : mysql.createPool({
      host: process.env.MYSQLHOST || 'localhost',
      port: Number(process.env.MYSQLPORT || 3306),
      user: process.env.MYSQLUSER || 'root',
      password: process.env.MYSQLPASSWORD || '',
      database: process.env.MYSQLDATABASE || 'railway',
      ...opciones,
    });
