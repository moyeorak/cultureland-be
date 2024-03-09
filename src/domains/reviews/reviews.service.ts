import {
  ObjectCannedACL,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { PrismaService } from 'src/db/prisma/prisma.service';
import { FailedToUploadFileException } from 'src/exceptions/FailedToUploadFile.exception';
import { UploadedFileNotFoundError } from 'src/exceptions/UploadedFileNotFoundError.exception';
import {
  CreateReactionRequestDto,
  CreateReviewRequestDto,
  ReviewResponseDto,
  ReviewWithReactionsType,
  SortOrder,
} from './reviews.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  async createReview(
    user: User,
    dto: CreateReviewRequestDto,
    imageFile: Express.Multer.File,
  ) {
    const { eventId, rating, content } = dto;
    const userId = user.id;
    const image = await this.uploadImgToS3(imageFile);
    if (!image) throw new UploadedFileNotFoundError();

    const review = await this.prismaService.review.create({
      data: {
        reviewerId: userId,
        eventId: Number(eventId),
        rating: Number(rating),
        content,
        image,
      },
    });

    return review;
  }

  async uploadImgToS3(file: Express.Multer.File) {
    if (!file) return undefined;

    const awsRegion = this.configService.getOrThrow('AWS_REGION');
    const bucketName = this.configService.getOrThrow('AWS_S3_BUCKET_NAME');
    const client = new S3Client({
      region: awsRegion,
      credentials: {
        accessKeyId: this.configService.getOrThrow('AWS_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow('AWS_SECRET_KEY'),
      },
    });
    const key = `cultureland/review/${Date.now().toString()}-${file.originalname}`;
    const params: PutObjectCommandInput = {
      Key: key,
      Body: file.buffer,
      Bucket: bucketName,
      ACL: ObjectCannedACL.public_read,
    };
    const command = new PutObjectCommand(params);

    const uploadFileS3 = await client.send(command);

    if (uploadFileS3.$metadata.httpStatusCode !== 200)
      throw new FailedToUploadFileException();
    const imgUrl = `${key}`;
    return imgUrl;
  }

  async getEventReviews(eventId: string, orderBy: SortOrder) {
    const reviews = await this.prismaService.review.findMany({
      where: { eventId: Number(eventId) },
      select: {
        id: true,
        reviewerId: true,
        eventId: true,
        image: true,
        rating: true,
        content: true,
        createdAt: true,
        reviewReactions: {
          select: {
            userId: true,
            reviewId: true,
            reactionValue: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const reviewsWithReactionCounts = this.countReactions(reviews);

    if (!orderBy || orderBy === 'recent') {
      return reviewsWithReactionCounts;
    } else if (orderBy === 'likes') {
      return reviewsWithReactionCounts.sort((a, b) => b.likes - a.likes);
    } else {
      return reviewsWithReactionCounts.sort((a, b) => b.hates - a.hates);
    }
  }

  countReactions(reviews: ReviewWithReactionsType[]): ReviewResponseDto[] {
    return reviews.map((review) => ({
      ...review,
      likes: review.reviewReactions.filter(
        (reaction) => reaction.reactionValue === 1,
      ).length,
      hates: review.reviewReactions.filter(
        (reaction) => reaction.reactionValue === -1,
      ).length,
    }));
  }

  async getFamousReviews() {
    const reviews = await this.prismaService.review.findMany({
      include: {
        reviewReactions: {
          where: {
            reactionValue: 1,
          },
        },
      },
      orderBy: {
        reviewReactions: {
          _count: 'desc',
        },
      },
      take: 10,
    });

    return reviews;
  }

  async createReaction(
    user: User,
    reviewId: number,
    dto: CreateReactionRequestDto,
  ) {
    const { reactionValue } = dto;

    const reviewReaction = await this.prismaService.reviewReaction.create({
      data: { userId: user.id, reviewId, reactionValue },
    });

    return reviewReaction;
  }

  async deleteReaction(user: User, reviewId: number) {
    await this.prismaService.reviewReaction.delete({
      where: {
        userId_reviewId: {
          userId: user.id,
          reviewId: reviewId,
        },
      },
    });

    return reviewId;
  }
}
