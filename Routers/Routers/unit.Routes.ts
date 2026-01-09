/*
┌───────────────────────────────────────────────────────────────────────┐
│  Unit Routes - API endpoints for Unit management.                     │
│  Routes for managing Parent and Child Units (CRUD operations).        │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from 'express';
import unitServices from '../../Services/unit.Service';
import { adminMiddleware } from '../../Middlewares/CheckLoginMiddleware';


const { ParentUnitServices, ChildUnitServices } = unitServices;

const unitRouter = Router();
const r = unitRouter;

// parent unit routes
r.post('/add-parent-units', ParentUnitServices.createParentUnit);
r.get('/get-parent-units', adminMiddleware, ParentUnitServices.getAllParentUnits);
r.put('/update-parent-units/:id', adminMiddleware, ParentUnitServices.updateParentUnit);
r.delete('/delete-parent-units/:id', adminMiddleware, ParentUnitServices.deleteParentUnit);
// child unit routes
r.post('/add-child-units', ChildUnitServices.createChildUnit);
r.get('/get-child-units', adminMiddleware, ChildUnitServices.getAllChildUnits);
r.put('/update-child-units/:id', adminMiddleware, ChildUnitServices.updateChildUnit);
r.delete('/delete-child-units/:id', adminMiddleware, ChildUnitServices.deleteChildUnit);

export default unitRouter;