import validator from 'validator';
import User from '../../src/models/User.model';
import { generateMockUser, hashPassword } from '../helpers/testHelpers';
import bcrypt from 'bcryptjs';

describe('User Model', () => {
    describe('Schema Validation', () => {
        it('should create user with valid data', async () => {
            const userData = generateMockUser();
            const user = await User.create({
                ...userData,
                password: await hashPassword(userData.password),
            });

            expect(user).toBeDefined();
            expect(user.email).toBe(validator.normalizeEmail(userData.email));
            expect(user.name).toBe(userData.name);
        });

        it('should require email', async () => {
            const userData = generateMockUser();
            delete (userData as any).email;

            await expect(
                User.create({
                    ...userData,
                    password: await hashPassword('Password123!'),
                })
            ).rejects.toThrow();
        });

        it('should require unique email', async () => {
            const userData = generateMockUser();

            await User.create({
                ...userData,
                password: await hashPassword('Password123!'),
            });

            await expect(
                User.create({
                    ...userData,
                    password: await hashPassword('Password123!'),
                })
            ).rejects.toThrow();
        });

        it('should require unique phone', async () => {
            const userData1 = generateMockUser();
            const userData2 = generateMockUser({ phone: userData1.phone });

            await User.create({
                ...userData1,
                password: await hashPassword('Password123!'),
            });

            await expect(
                User.create({
                    ...userData2,
                    password: await hashPassword('Password123!'),
                })
            ).rejects.toThrow();
        });

        it('should normalize email (lowercase and strip dots)', async () => {
            const userData = generateMockUser({ email: 'TEST.USER@GMAIL.COM' });
            const user = await User.create({
                ...userData,
                password: await hashPassword('Password123!'),
            });

            expect(user.email).toBe('testuser@gmail.com');
        });

        it('should set default role to user', async () => {
            const userData = generateMockUser();
            const user = await User.create({
                ...userData,
                password: await hashPassword('Password123!'),
            });

            expect(user.role).toBe('user');
        });

        it('should set default active to true', async () => {
            const userData = generateMockUser();
            const user = await User.create({
                ...userData,
                password: await hashPassword('Password123!'),
            });

            expect(user.active).toBe(true);
        });
    });

    describe('Password Methods', () => {
        it('should hash password before saving', async () => {
            const userData = generateMockUser();
            const plainPassword = 'Password123!';

            const user = new User({
                ...userData,
                password: plainPassword,
            });

            await user.save();

            expect(user.password).not.toBe(plainPassword);
            expect(user.password.length).toBeGreaterThan(plainPassword.length);
        });

        it('should not rehash password if not modified', async () => {
            const userData = generateMockUser();
            const user = await User.create({
                ...userData,
                password: 'Password123!',
            });

            const originalHash = user.password;
            user.name = 'Updated Name';
            await user.save();

            expect(user.password).toBe(originalHash);
        });

        it('should compare passwords correctly', async () => {
            const userData = generateMockUser();
            const plainPassword = 'Password123!';

            const user = await User.create({
                ...userData,
                password: plainPassword,
            });

            const userWithPassword = await User.findById(user._id).select('+password');
            const isMatch = await bcrypt.compare(plainPassword, userWithPassword!.password);

            expect(isMatch).toBe(true);
        });

        it('should reject incorrect password', async () => {
            const userData = generateMockUser();
            const user = await User.create({
                ...userData,
                password: 'Password123!',
            });

            const userWithPassword = await User.findById(user._id).select('+password');
            const isMatch = await bcrypt.compare('WrongPassword', userWithPassword!.password);

            expect(isMatch).toBe(false);
        });
    });

    describe('Password Changed After', () => {
        it('should detect password change after token issued', async () => {
            const userData = generateMockUser();
            const user = await User.create({
                ...userData,
                password: 'Password123!',
            });

            const tokenIssuedAt = Math.floor(Date.now() / 1000);

            // Simulate password change
            user.passwordChangedAt = new Date(Date.now() + 1000);
            await user.save();

            const changed = user.changedPasswordAfter(tokenIssuedAt);
            expect(changed).toBe(true);
        });

        it('should return false if password not changed', async () => {
            const userData = generateMockUser();
            const user = await User.create({
                ...userData,
                password: 'Password123!',
            });

            const tokenIssuedAt = Math.floor(Date.now() / 1000);
            const changed = user.changedPasswordAfter(tokenIssuedAt);

            expect(changed).toBe(false);
        });
    });

    describe('Query Middleware', () => {
        it('should exclude password by default', async () => {
            const userData = generateMockUser();
            await User.create({
                ...userData,
                password: 'Password123!',
            });

            const user = await User.findOne({ email: userData.email });
            expect(user).toBeDefined();
            expect((user as any).password).toBeUndefined();
        });

        it('should include password when explicitly selected', async () => {
            const userData = generateMockUser();
            await User.create({
                ...userData,
                password: 'Password123!',
            });

            const user = await User.findOne({ email: userData.email }).select('+password');
            expect(user).toBeDefined();
            expect(user!.password).toBeDefined();
        });
    });
});
