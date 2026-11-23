import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  selector: 'app-legal-page',
  styleUrl: './legal-page.css',
  templateUrl: './legal-page.html',
})
export class LegalPage {
  readonly kind = inject(ActivatedRoute).snapshot.data['kind'] as 'privacy' | 'terms' | 'cookies';
  readonly effectiveDate = '23 November 2026';
}
