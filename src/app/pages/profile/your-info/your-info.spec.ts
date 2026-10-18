import { ComponentFixture, TestBed } from '@angular/core/testing';
import { YourInfo } from './your-info';

describe('YourInfo', () => {
  let component: YourInfo;
  let fixture: ComponentFixture<YourInfo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [YourInfo],
    }).compileComponents();

    fixture = TestBed.createComponent(YourInfo);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
