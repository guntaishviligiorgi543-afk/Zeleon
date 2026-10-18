import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Product } from '../../models/product';
import { Products } from '../../services/products';
import { ProductCard } from '../../components/product-card/product-card';

type Category = 'all' | 'classic' | 'boost-blends' | 'zero-sugar';
type Sort = 'default' | 'priceLowToHigh' | 'priceHighToLow' | 'nameAToZ' | 'nameZToA';

@Component({
  imports: [RouterLink, ProductCard],
  selector: 'app-shop',
  styleUrl: './shop.css',
  templateUrl: './shop.html',
  host: { '(document:click)': 'closeSortOutside($event)' },
})
export class Shop {
  readonly products = signal<readonly Product[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  private readonly catalog = inject(Products);
  private readonly router = inject(Router);
  private request?: AbortController;

  constructor() {
    const destroyRef = inject(DestroyRef);
    inject(ActivatedRoute).queryParamMap.pipe(takeUntilDestroyed(destroyRef)).subscribe((params) => {
      const category = params.get('category');
      this.selectedCategory = ['classic', 'boost-blends', 'zero-sugar'].includes(category ?? '') ? category as Category : 'all';
    });
    afterNextRender(() => { void this.loadProducts(); });
    destroyRef.onDestroy(() => this.request?.abort());
  }

  async loadProducts(): Promise<void> {
    this.request?.abort();
    const request = this.request = new AbortController();
    this.loading.set(true);
    this.error.set('');
    try {
      const products = await this.catalog.getActiveProducts(request.signal);
      if (!request.signal.aborted) this.products.set(products);
    } catch (error) {
      if (!request.signal.aborted) this.error.set(error instanceof Error ? error.message : 'Products could not be loaded.');
    } finally {
      if (!request.signal.aborted) this.loading.set(false);
    }
  }

  navigateToProduct(id: string | number): void { void this.router.navigate(['/product', id]); }
  selectedCategory: Category = 'all';
  selectedSort: Sort = 'default';
  readonly sortOpen = signal(false);
  readonly activeSort = signal(0);
  readonly sortOptions: readonly { value: Sort; label: string }[] = [
    { value: 'default', label: 'Default' },
    { value: 'priceLowToHigh', label: 'Price: Low to High' },
    { value: 'priceHighToLow', label: 'Price: High to Low' },
    { value: 'nameAToZ', label: 'Name: A to Z' },
    { value: 'nameZToA', label: 'Name: Z to A' },
  ];
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  get sortLabel(): string { return this.sortOptions.find((option) => option.value === this.selectedSort)!.label; }

  toggleSort(): void {
    this.activeSort.set(this.sortOptions.findIndex((option) => option.value === this.selectedSort));
    this.sortOpen.update((open) => !open);
  }

  chooseSort(value: Sort): void {
    this.selectedSort = value;
    this.sortOpen.set(false);
  }

  closeSortOutside(event: MouseEvent): void {
    if (!this.element.nativeElement.querySelector('.sort')?.contains(event.target as Node)) this.sortOpen.set(false);
  }

  sortFocusOut(event: FocusEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) this.sortOpen.set(false);
  }

  sortKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') { this.sortOpen.set(false); return; }
    if (event.key === 'Escape') { this.sortOpen.set(false); event.preventDefault(); return; }
    if (['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (this.sortOpen()) this.chooseSort(this.sortOptions[this.activeSort()].value);
      else this.toggleSort();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!this.sortOpen()) { this.toggleSort(); return; }
    const length = this.sortOptions.length;
    this.activeSort.set(event.key === 'Home' ? 0 : event.key === 'End' ? length - 1 :
      (this.activeSort() + (event.key === 'ArrowDown' ? 1 : -1) + length) % length);
  }

  get selectedCategoryName(): string {
    return {
      all: 'All Products', classic: 'Classic',
      'boost-blends': 'Boost Blends', 'zero-sugar': 'Zero Sugar',
    }[this.selectedCategory];
  }

  get displayedProducts(): Product[] {
    const products = this.products().filter((product) =>
      this.selectedCategory === 'all' || product.category === this.selectedCategory,
    );
    switch (this.selectedSort) {
      case 'priceLowToHigh': return products.sort((a, b) => a.price - b.price);
      case 'priceHighToLow': return products.sort((a, b) => b.price - a.price);
      case 'nameAToZ': return products.sort((a, b) => a.name.localeCompare(b.name));
      case 'nameZToA': return products.sort((a, b) => b.name.localeCompare(a.name));
      default: return products;
    }
  }

  selectCategory(category: Category): void {
    this.selectedCategory = category;
  }

}
