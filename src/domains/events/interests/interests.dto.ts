import { IsNumber } from 'class-validator';

export class CreateInterestDto {
  @IsNumber()
  eventId;
}
