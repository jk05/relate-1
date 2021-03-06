import {Inject, Injectable} from '@nestjs/common';
import {AbstractHttpAdapter} from '@nestjs/core';
import express from 'express';
import path from 'path';
import {EXTENSION_DIR_NAME, EXTENSION_TYPES, envPaths, STATIC_APP_BASE_ENDPOINT, SystemProvider} from '@relate/common';

@Injectable()
export class AppsService {
    constructor(@Inject(SystemProvider) protected readonly systemProvider: SystemProvider) {}

    register(httpAdapter: AbstractHttpAdapter): void {
        if (!httpAdapter) {
            return;
        }

        const app = httpAdapter.getInstance();
        const installedApps = path.join(envPaths().data, EXTENSION_DIR_NAME, EXTENSION_TYPES.STATIC);

        app.use(STATIC_APP_BASE_ENDPOINT, express.static(installedApps));
    }
}
