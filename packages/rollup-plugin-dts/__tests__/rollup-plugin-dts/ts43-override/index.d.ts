import type { HideT, ShowT } from "./foo";
import { SomeComponent } from "./foo";

export class SpecializedComponent extends SomeComponent {
    override show(): ShowT;
    override hide(): HideT;
}
