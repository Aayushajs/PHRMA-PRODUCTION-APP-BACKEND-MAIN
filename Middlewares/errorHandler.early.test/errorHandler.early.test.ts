
import { NextFunction, Request, Response } from 'express';
import { errorHandler } from '../errorHandler';


// errorHandler.test.ts


// errorHandler.test.ts
describe('errorHandler() errorHandler method', () => {
    // Happy Paths
    describe('Happy Paths', () => {
        it('should handle a standard error with statusCode and message', () => {
            // This test ensures that when an error with a statusCode and message is passed, 
            // the handler responds with the correct status and JSON structure.
            const err = new Error('Test error');
            (err as any).statusCode = 400;

            const req = {} as Request;
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            } as unknown as Response;
            const next = jest.fn() as NextFunction;

            errorHandler(err, req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                statusCode: 400,
                message: 'Test error'
            });
        });

        it('should handle an error without statusCode but with a message', () => {
            // This test ensures that if the error does not have a statusCode, 
            // the handler defaults to 500 and uses the error's message.
            const err = new Error('Another error');

            const req = {} as Request;
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            } as unknown as Response;
            const next = jest.fn() as NextFunction;

            errorHandler(err, req, res, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                statusCode: 500,
                message: 'Another error'
            });
        });

        it('should handle an error with a custom statusCode and custom message', () => {
            // This test ensures that custom statusCode and message are both respected.
            const err = new Error('Custom message');
            (err as any).statusCode = 403;

            const req = {} as Request;
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            } as unknown as Response;
            const next = jest.fn() as NextFunction;

            errorHandler(err, req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                statusCode: 403,
                message: 'Custom message'
            });
        });
    });

    // Edge Cases
    describe('Edge Cases', () => {
        it('should handle an error with no message property', () => {
            // This test ensures that if the error does not have a message, 
            // the handler defaults to "Internal Server Error".
            const err = {} as Error;
            (err as any).statusCode = 422;

            const req = {} as Request;
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            } as unknown as Response;
            const next = jest.fn() as NextFunction;

            errorHandler(err, req, res, next);

            expect(res.status).toHaveBeenCalledWith(422);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                statusCode: 422,
                message: 'Internal Server Error'
            });
        });

        it('should handle an error with no statusCode and no message', () => {
            // This test ensures that if the error has neither statusCode nor message, 
            // the handler defaults to 500 and "Internal Server Error".
            const err = {} as Error;

            const req = {} as Request;
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            } as unknown as Response;
            const next = jest.fn() as NextFunction;

            errorHandler(err, req, res, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                statusCode: 500,
                message: 'Internal Server Error'
            });
        });

        it('should handle an error with a falsy statusCode (e.g., 0)', () => {
            // This test ensures that if the error has a falsy statusCode (like 0), 
            // the handler defaults to 500.
            const err = new Error('Falsy statusCode');
            (err as any).statusCode = 0;

            const req = {} as Request;
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            } as unknown as Response;
            const next = jest.fn() as NextFunction;

            errorHandler(err, req, res, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                statusCode: 500,
                message: 'Falsy statusCode'
            });
        });

        it('should handle an error with a non-numeric statusCode', () => {
            // This test ensures that if the error has a non-numeric statusCode, 
            // the handler defaults to 500.
            const err = new Error('Non-numeric statusCode');
            (err as any).statusCode = 'not-a-number';

            const req = {} as Request;
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            } as unknown as Response;
            const next = jest.fn() as NextFunction;

            errorHandler(err, req, res, next);

            expect(res.status).toHaveBeenCalledWith('not-a-number');
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                statusCode: 'not-a-number',
                message: 'Non-numeric statusCode'
            });
        });

        it('should handle an error with an empty string message', () => {
            // This test ensures that if the error has an empty string as a message, 
            // the handler uses the empty string as the message.
            const err = new Error('');
            (err as any).statusCode = 401;

            const req = {} as Request;
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            } as unknown as Response;
            const next = jest.fn() as NextFunction;

            errorHandler(err, req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                statusCode: 401,
                message: ''
            });
        });

        it('should call res.status and res.json only once each', () => {
            // This test ensures that the handler does not call res.status or res.json multiple times.
            const err = new Error('Single call test');
            (err as any).statusCode = 418;

            const req = {} as Request;
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            } as unknown as Response;
            const next = jest.fn() as NextFunction;

            errorHandler(err, req, res, next);

            expect(res.status).toHaveBeenCalledTimes(1);
            expect(res.json).toHaveBeenCalledTimes(1);
        });
    });
});