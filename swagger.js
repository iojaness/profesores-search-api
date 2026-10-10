const path = require('node:path');
const swaggerJsdoc = require('swagger-jsdoc');

module.exports = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API de Docentes - Consulta',
      version: '1.0.0',
      description: 'Microservicio de consulta de docentes de UNINPAHU (MySQL)',
    },
  },
  apis: [path.join(__dirname, 'index.js')],
});
