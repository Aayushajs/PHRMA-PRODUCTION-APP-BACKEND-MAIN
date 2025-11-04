import {Router} from 'express';
import unitServices from '../../Services/unit.Services';
import { customersMiddleware } from '../../Middlewares/CheckLoginMiddleware';

const { ParentUnitServices, ChildUnitServices } = unitServices;

const unitRouter = Router();
const r = unitRouter;

// parent unit routes
r.post('/parent-units', customersMiddleware, ParentUnitServices.createParentUnit);
r.get('/parent-units', customersMiddleware, ParentUnitServices.getAllParentUnits);
r.put('/parent-units/:id', customersMiddleware, ParentUnitServices.updateParentUnit);
r.delete('/parent-units/:id', customersMiddleware, ParentUnitServices.deleteParentUnit);
// child unit routes
r.post('/child-units', customersMiddleware, ChildUnitServices.createChildUnit);
r.get('/child-units', customersMiddleware, ChildUnitServices.getAllChildUnits);
r.put('/child-units/:id', customersMiddleware, ChildUnitServices.updateChildUnit);
r.delete('/child-units/:id', customersMiddleware, ChildUnitServices.deleteChildUnit);

export default unitRouter;