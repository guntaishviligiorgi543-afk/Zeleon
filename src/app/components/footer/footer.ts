import { Component, inject } from '@angular/core';
import { Analytics } from '../../services/analytics';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  selector: 'app-footer',
  styleUrl: './footer.css',
  templateUrl: './footer.html',
})
export class Footer { readonly analytics = inject(Analytics); }
