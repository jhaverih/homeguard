import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Like JwtAuthGuard, but lets the request through without a token (or with
// an invalid one) — req.user is then undefined. For public endpoints whose
// response differs for a signed-in user.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(_err: unknown, user: any) {
    return user || undefined;
  }
}
