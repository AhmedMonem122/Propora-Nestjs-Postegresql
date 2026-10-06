import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { StorageModule } from './storage/storage.module.js';
import { AuthModule } from './auth/auth.module.js';
import { RbacModule } from './rbac/rbac.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { UsersModule } from './users/users.module.js';
import { PropertiesModule } from './properties/properties.module.js';
import { ResidentsModule } from './residents/residents.module.js';
import { LeasesModule } from './leases/leases.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { HealthController } from './health/health.controller.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor.js';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    StorageModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          limit: 100,
          ttl: 60,
        },
      ],
    }),
    AuthModule,
    RbacModule,
    OrganizationsModule,
    UsersModule,
    PropertiesModule,
    ResidentsModule,
    LeasesModule,
    MaintenanceModule,
    DocumentsModule,
    NotificationsModule,
    ReportsModule,
    PlatformModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
