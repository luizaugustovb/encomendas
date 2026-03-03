import { Module } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesController } from './deliveries.controller';
import { TotemController } from './totem.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { TenantConfigModule } from '../tenant-config/tenant-config.module';
import { HikvisionModule } from '../hikvision/hikvision.module';

@Module({
  imports: [WhatsappModule, TenantConfigModule, HikvisionModule],
  controllers: [DeliveriesController, TotemController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
