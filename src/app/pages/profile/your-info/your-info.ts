import { Component, inject, OnInit } from '@angular/core';
import { Auth } from '../../../services/auth';

@Component({
  imports: [],
  selector: 'app-your-info',
  styleUrl: './your-info.css',
  templateUrl: './your-info.html',
})
export class YourInfo implements OnInit {
  readonly auth = inject(Auth);
  async ngOnInit(): Promise<void> { try { await this.auth.loadPreferredName(); } catch { /* Profile details remain available if the optional table is not deployed. */ } }
}
