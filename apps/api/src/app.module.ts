import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TenantsModule } from './tenants/tenants.module';
import { UnitsModule } from './units/units.module';
import { LocationsModule } from './locations/locations.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { HikvisionModule } from './hikvision/hikvision.module';
import { RedisModule } from './redis/redis.module';
import { TenantConfigModule } from './tenant-config/tenant-config.module';
import { EquipmentModule } from './equipment/equipment.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    UnitsModule,
    LocationsModule,
    DeliveriesModule,
    WhatsappModule,
    HikvisionModule,
    TenantConfigModule,
    EquipmentModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
