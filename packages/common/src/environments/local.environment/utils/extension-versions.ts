import got from 'got';
import _ from 'lodash';
import semver from 'semver';
import {promises as fs} from 'fs';
import fse from 'fs-extra';
import path from 'path';

import {
    EXTENSION_DIR_NAME,
    EXTENSION_NPM_PREFIX,
    EXTENSION_ORIGIN,
    EXTENSION_MANIFEST,
    EXTENSION_MANIFEST_KEY,
    EXTENSION_TYPES,
    PACKAGE_JSON,
} from '../../../constants';
import {
    EXTENSION_REPO_NAME,
    EXTENSION_SEARCH_PATH,
    JFROG_PRIVATE_REGISTRY_PASSWORD,
    JFROG_PRIVATE_REGISTRY_USERNAME,
} from '../../environment.constants';
import {InvalidArgumentError, NotFoundError} from '../../../errors';
import {ExtensionModel, IInstalledExtension} from '../../../models';
import {envPaths} from '../../../utils';

export interface IExtensionMeta {
    type: EXTENSION_TYPES;
    name: string;
    version: string;
    dist: string;
    manifest: IInstalledExtension;
    origin: EXTENSION_ORIGIN;
}

export const discoverExtensionDistributions = async (distributionsRoot: string): Promise<IExtensionMeta[]> => {
    const dirFiles = await fs.readdir(distributionsRoot, {withFileTypes: true});
    const files = await Promise.all(
        _.map(dirFiles, async (dir) => {
            const stats = await fse.stat(path.join(distributionsRoot, dir.name));

            return stats.isDirectory() ? dir : null;
        }),
    );
    const dirs = _.compact(files);
    const distPromises: Promise<IExtensionMeta | null>[] = _.map(dirs, (dir) =>
        discoverExtension(path.join(distributionsRoot, dir.name)).catch(() => null),
    );
    const dists = _.compact(await Promise.all(distPromises));

    return dists.filter((dist) => dist.version === '*' || semver.valid(dist.version));
};

export async function discoverExtension(extensionRootDir: string): Promise<IExtensionMeta> {
    const exists = await fse.pathExists(extensionRootDir);
    const dirName = path.basename(extensionRootDir);

    if (!exists) {
        throw new NotFoundError(`Extension ${dirName} not found`);
    }

    const extensionManifest = path.join(extensionRootDir, EXTENSION_MANIFEST);
    const hasManifest = await fse.pathExists(extensionManifest);
    const extensionPackageJson = path.join(extensionRootDir, PACKAGE_JSON);
    const hasPackageJson = await fse.pathExists(extensionPackageJson);

    if (hasManifest) {
        const manifest = await fse.readJSON(extensionManifest);

        return {
            dist: extensionRootDir,
            manifest: new ExtensionModel({
                root: extensionRootDir,
                ...manifest,
            }),
            name: _.replace(manifest.name, EXTENSION_NPM_PREFIX, ''),
            origin: EXTENSION_ORIGIN.CACHED,
            type: manifest.type,
            version: manifest.version,
        };
    }

    if (!hasPackageJson) {
        throw new InvalidArgumentError(`${dirName} contains no valid manifest`);
    }

    const packageJson = await fse.readJSON(extensionPackageJson);

    if (_.has(packageJson, EXTENSION_MANIFEST_KEY)) {
        const manifest = new ExtensionModel({
            root: extensionRootDir,
            ...packageJson[EXTENSION_MANIFEST_KEY],
        });

        return {
            dist: extensionRootDir,
            manifest,
            name: _.replace(manifest.name, EXTENSION_NPM_PREFIX, ''),
            // @todo: whut?
            origin: EXTENSION_ORIGIN.CACHED,
            type: manifest.type,
            version: manifest.version,
        };
    }

    const {name, main = '.', version} = packageJson;
    const extensionName = name.split(path.sep)[1] || name;

    return {
        dist: extensionRootDir,
        manifest: new ExtensionModel({
            main,
            name: extensionName,
            root: extensionRootDir,
            type: EXTENSION_TYPES.STATIC,
            version,
        }),
        name: _.replace(extensionName, EXTENSION_NPM_PREFIX, ''),
        // @todo: whut?
        origin: EXTENSION_ORIGIN.CACHED,
        type: EXTENSION_TYPES.STATIC,
        version,
    };
}

export interface IExtensionVersion {
    name: string;
    version: string;
    origin: EXTENSION_ORIGIN;
}

export async function fetchExtensionVersions(): Promise<IExtensionVersion[]> {
    const cached = await discoverExtensionDistributions(path.join(envPaths().cache, EXTENSION_DIR_NAME));
    const search = {
        path: {$match: `${EXTENSION_NPM_PREFIX}*`},
        repo: {$eq: EXTENSION_REPO_NAME},
    };

    const {results} = await got(EXTENSION_SEARCH_PATH, {
        // @todo: handle env vars
        body: `items.find(${JSON.stringify(search)})`,
        method: 'POST',
        password: JFROG_PRIVATE_REGISTRY_PASSWORD,
        username: JFROG_PRIVATE_REGISTRY_USERNAME,
    }).json();

    return _.concat(cached, mapArtifactoryResponse(results));
}

function mapArtifactoryResponse(results: any[]): IExtensionVersion[] {
    return _.compact(
        _.map(results, ({name}) => {
            const versionPart = _.last(_.split(_.replace(name, '.tgz', ''), '-'));
            const version = semver.coerce(versionPart);

            if (!version) {
                return null;
            }

            const extName = _.head(_.split(name, `-${version.version}`));

            if (!extName) {
                return null;
            }

            return {
                name: extName,
                origin: EXTENSION_ORIGIN.ONLINE,
                version: version.version,
            };
        }),
    );
}