import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AccountsService } from '../accounts.service';
import { SignInRequestDto, SignUpRequestDto } from './partners.dto';
import { PartnersService } from './partners.service';

@Controller('accounts/partners')
export class PartnersController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly configService: ConfigService,
    private readonly partnersService: PartnersService,
  ) {}

  maxAge = Number(
    this.configService.getOrThrow<string>('ACCESS_TOKEN_MAX_AGE'),
  );

  @Get('email-check')
  async emailCheck(@Query('email') email) {
    const isExistingEmail = await this.partnersService.emailCheck(email);

    return isExistingEmail;
  }

  @Post('sign-up')
  async signUp(
    @Body() dto: SignUpRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const accessToken = await this.partnersService.signUp(dto);

    this.accountsService.setAccessTokenCookie(response, accessToken);

    return accessToken;
  }

  @Post('sign-in')
  async signIn(
    @Body() dto: SignInRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const accessToken = await this.partnersService.signIn(dto);

    this.accountsService.setAccessTokenCookie(response, accessToken);

    return accessToken;
  }

  @Post('sign-out')
  async signOut(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('accessToken', {
      domain: process.env.BACKEND_SERVER,
      secure: true,
      httpOnly: true,
      sameSite: 'none',
    });

    return 'successfuly signed out';
  }
}
