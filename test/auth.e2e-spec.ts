import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module.js';

const dbUrl = process.env.DATABASE_URL ?? '';
const hasDatabase = Boolean(dbUrl) && !dbUrl.includes('xxxxx');

const unique = () => Date.now().toString(36);

describe.skipIf(!hasDatabase)('Propora API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('health check responds ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('registers an organization and returns an owner token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        organizationName: `E2E Properties ${unique()}`,
        firstName: 'E2E',
        lastName: 'Owner',
        email: `owner-${unique()}@e2e.propora.io`,
        password: 'E2EPassword123!',
      });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.roles).toContain('ORGANIZATION_OWNER');

    return res.body.accessToken as string;
  });

  it('enforces tenant isolation between organizations', async () => {
    const orgA = `a-${unique()}@e2e.propora.io`;
    const orgB = `b-${unique()}@e2e.propora.io`;

    const register = (email: string, name: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          organizationName: name,
          firstName: 'E2E',
          lastName: 'Owner',
          email,
          password: 'E2EPassword123!',
        });

    const login = (email: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'E2EPassword123!' });

    const resA = await register(orgA, `Org A ${unique()}`);
    const tokenA = resA.body.accessToken as string;
    await register(orgB, `Org B ${unique()}`);
    const resBLogin = await login(orgB);
    const tokenB = resBLogin.body.accessToken as string;

    const created = await request(app.getHttpServer())
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Secret Property A', city: 'Cairo' });

    expect(created.status).toBe(201);
    const propertyId = created.body.id as string;

    const leaked = await request(app.getHttpServer())
      .get(`/api/v1/properties/${propertyId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(leaked.status).toBe(404);

    const seen = await request(app.getHttpServer())
      .get('/api/v1/properties')
      .set('Authorization', `Bearer ${tokenB}`);

    const ids = seen.body.data.map(
      (property: { id: string }) => property.id,
    );
    expect(ids).not.toContain(propertyId);
  });

  it('rejects a member without the required permission (RBAC 403)', async () => {
    const email = `owner-${unique()}@e2e.propora.io`;

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        organizationName: `RBAC Org ${unique()}`,
        firstName: 'E2E',
        lastName: 'Owner',
        email,
        password: 'E2EPassword123!',
      });

    const ownerToken = registerRes.body.accessToken as string;

    const memberEmail = `member-${unique()}@e2e.propora.io`;

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        firstName: 'No',
        lastName: 'Permissions',
        email: memberEmail,
        password: 'E2EPassword123!',
        roleIds: [],
      });

    const memberLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: memberEmail, password: 'E2EPassword123!' });

    const memberToken = memberLogin.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .get('/api/v1/properties')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/property:read/);
  });

  it('refuses an invalid access token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/properties')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(res.status).toBe(401);
  });
});
