import { Module, forwardRef } from '@nestjs/common';
import { HikvisionService } from './hikvision.service';
import { HikvisionCallbackController, HikvisionAdminController } from './hikvision.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { TenantConfigModule } from '../tenant-config/tenant-config.module';

@Module({
  imports: [WhatsappModule, forwardRef(() => TenantConfigModule)],
  controllers: [HikvisionCallbackController, HikvisionAdminController],
  providers: [HikvisionService],
  exports: [HikvisionService],
})
export class HikvisionModule {}
