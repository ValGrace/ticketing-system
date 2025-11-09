import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec, swaggerUiOptions } from '../config/swagger';

const router = Router();

/**
 * @swagger
 * /docs:
 *   get:
 *     summary: API Documentation
 *     description: Interactive API documentation using Swagger UI
 *     tags: [Documentation]
 *     responses:
 *       200:
 *         description: API documentation page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */

/**
 * @swagger
 * /docs/json:
 *   get:
 *     summary: OpenAPI Specification
 *     description: Returns the OpenAPI specification in JSON format
 *     tags: [Documentation]
 *     responses:
 *       200:
 *         description: OpenAPI specification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */

// Serve Swagger UI
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// Serve raw OpenAPI spec
router.get('/json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Serve OpenAPI spec in YAML format
router.get('/yaml', (_req, res) => {
  const yaml = require('js-yaml');
  res.setHeader('Content-Type', 'text/yaml');
  res.send(yaml.dump(swaggerSpec));
});

export default router;