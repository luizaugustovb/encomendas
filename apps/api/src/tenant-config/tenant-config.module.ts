import { Module, forwardRef } from '@nestjs/common';
import { TenantConfigService } from './tenant-config.service';
import { TenantConfigController } from './tenant-config.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { HikvisionModule } from '../hikvision/hikvision.module';

@Module({
  imports: [WhatsappModule, forwardRef(() => HikvisionModule)],
  controllers: [TenantConfigController],
  providers: [TenantConfigService],
  exports: [TenantConfigService],
})
export class TenantConfigModule {}
