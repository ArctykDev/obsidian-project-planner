import * as fs from 'fs';
import * as path from 'path';

describe('Manifest Compliance', () => {
    let manifest: any;
    let versions: any;

    beforeAll(() => {
        const manifestPath = path.join(__dirname, '../../manifest.json');
        const versionsPath = path.join(__dirname, '../../versions.json');
        
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        versions = JSON.parse(fs.readFileSync(versionsPath, 'utf-8'));
    });

    describe('Required Fields', () => {
        it('should have id field', () => {
            expect(manifest.id).toBeDefined();
            expect(typeof manifest.id).toBe('string');
            expect(manifest.id.length).toBeGreaterThan(0);
        });

        it('should have name field', () => {
            expect(manifest.name).toBeDefined();
            expect(typeof manifest.name).toBe('string');
            expect(manifest.name.length).toBeGreaterThan(0);
        });

        it('should have version field', () => {
            expect(manifest.version).toBeDefined();
            expect(typeof manifest.version).toBe('string');
            expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
        });

        it('should have minAppVersion field', () => {
            expect(manifest.minAppVersion).toBeDefined();
            expect(typeof manifest.minAppVersion).toBe('string');
            expect(manifest.minAppVersion).toMatch(/^\d+\.\d+\.\d+$/);
        });

        it('should have description field', () => {
            expect(manifest.description).toBeDefined();
            expect(typeof manifest.description).toBe('string');
            expect(manifest.description.length).toBeGreaterThan(0);
            expect(manifest.description.length).toBeLessThanOrEqual(250);
        });

        it('should have author field', () => {
            expect(manifest.author).toBeDefined();
            expect(typeof manifest.author).toBe('string');
        });

        it('should have authorUrl field', () => {
            expect(manifest.authorUrl).toBeDefined();
            expect(typeof manifest.authorUrl).toBe('string');
            expect(manifest.authorUrl).toMatch(/^https?:\/\//);
        });
    });

    describe('ID Validation', () => {
        it('should use lowercase kebab-case for id', () => {
            expect(manifest.id).toMatch(/^[a-z0-9-]+$/);
        });

        it('should not be exactly "obsidian" (reserved)', () => {
            expect(manifest.id.toLowerCase()).not.toBe('obsidian');
            // Note: 'obsidian-something' is allowed, only 'obsidian' alone is reserved
        });
    });

    describe('Version Consistency', () => {
        it('should have matching version in manifest and versions.json', () => {
            expect(versions[manifest.version]).toBeDefined();
        });

        it('should not have versions newer than manifest', () => {
            const manifestVer = manifest.version.split('.').map(Number);
            
            Object.keys(versions).forEach(ver => {
                const parts = ver.split('.').map(Number);
                const isNewer = parts[0] > manifestVer[0] ||
                    (parts[0] === manifestVer[0] && parts[1] > manifestVer[1]) ||
                    (parts[0] === manifestVer[0] && parts[1] === manifestVer[1] && parts[2] > manifestVer[2]);
                
                expect(isNewer).toBe(false);
            });
        });

        it('should have valid minAppVersion in versions.json', () => {
            Object.values(versions).forEach((minVer: any) => {
                expect(minVer).toMatch(/^\d+\.\d+\.\d+$/);
            });
        });
    });

    describe('Optional Recommended Fields', () => {
        it('should have isDesktopOnly flag if not mobile compatible', () => {
            if (manifest.isDesktopOnly !== undefined) {
                expect(typeof manifest.isDesktopOnly).toBe('boolean');
            }
        });

        it('should have fundingUrl if accepting donations', () => {
            if (manifest.fundingUrl) {
                expect(typeof manifest.fundingUrl).toBe('string');
                expect(manifest.fundingUrl).toMatch(/^https?:\/\//);
            }
        });
    });

    describe('File Structure', () => {
        it('should have main.js referenced (built output)', () => {
            // Manifest doesn't explicitly reference main.js, but it's required
            const mainPath = path.join(__dirname, '../../main.js');
            expect(fs.existsSync(mainPath)).toBe(true);
        });

        it('should have styles.css', () => {
            const stylesPath = path.join(__dirname, '../../styles.css');
            expect(fs.existsSync(stylesPath)).toBe(true);
        });
    });
});
