import { Module } from '@nestjs/common';

import { GuardiasController } from './guardias.controller';
import { MeController } from './me.controller';

@Module({
  controllers: [MeController, GuardiasController],
})
export class AppModule {}
