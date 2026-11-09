import { Component, inject } from '@angular/core';
import { StaffAccess } from '../../services/staff-access';

@Component({
  selector: 'app-staff-workspace',
  standalone: true,
  template: '<main><p>Staff workspace</p><h1>{{ staff.role() }}</h1><p>The staff workspace is being prepared.</p></main>',
  imports: [],
})
export class StaffWorkspace {
  readonly staff = inject(StaffAccess);
}
