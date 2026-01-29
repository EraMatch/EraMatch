import svgPaths from "./svg-75to9q7l5a";
import imgImageEramatch from "../assets/image-eramatch.png";

function ImageEramatch() {
  return (
    <div className="h-[40px] relative shrink-0 w-[201.188px]" data-name="Image (ERAMATCH)">
      <img alt="" className="absolute bg-clip-padding border-0 border-[transparent] border-solid box-border inset-0 max-w-none object-50%-50% object-cover pointer-events-none size-full" src={imgImageEramatch} />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[40px] w-[201.188px]" />
    </div>
  );
}

function Icon() {
  return (
    <div className="h-[20px] overflow-clip relative shrink-0 w-full" data-name="Icon">
      <div className="absolute inset-[87.5%_42.78%_8.33%_42.78%]" data-name="Vector">
        <div className="absolute inset-[-100.03%_-28.87%_-100.01%_-28.87%]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 5 3">
            <path d={svgPaths.p1f8ebe00} id="Vector" stroke="var(--stroke-0, #18BA84)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
          </svg>
        </div>
      </div>
      <div className="absolute inset-[8.33%_12.5%_29.17%_12.5%]" data-name="Vector">
        <div className="absolute inset-[-6.67%_-5.56%]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17 15">
            <path d={svgPaths.p259fd370} id="Vector" stroke="var(--stroke-0, #18BA84)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Button() {
  return (
    <div className="relative rounded-[10px] shrink-0 size-[36px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex flex-col items-start pb-0 pt-[8px] px-[8px] relative size-[36px]">
        <Icon />
      </div>
    </div>
  );
}

function Button1() {
  return (
    <div className="basis-0 grow h-[42px] min-h-px min-w-px relative rounded-[1.67772e+07px] shrink-0" data-name="Button">
      <div aria-hidden="true" className="absolute border border-[#c63434] border-solid inset-0 pointer-events-none rounded-[1.67772e+07px]" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[42px] relative w-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[47.5px] text-[#c63434] text-[16px] text-center text-nowrap top-[7px] translate-x-[-50%] whitespace-pre">Sign out</p>
      </div>
    </div>
  );
}

function Container() {
  return (
    <div className="h-[42px] relative shrink-0 w-[145.086px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex gap-[16px] h-[42px] items-center relative w-[145.086px]">
        <Button />
        <Button1 />
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="bg-[#edf0f8] h-[90px] relative shrink-0 w-full" data-name="Header">
      <div className="flex flex-row items-center size-full">
        <div className="box-border content-stretch flex h-[90px] items-center justify-between px-[32px] py-0 relative w-full">
          <ImageEramatch />
          <Container />
        </div>
      </div>
    </div>
  );
}

function Text() {
  return (
    <div className="basis-0 grow h-[60px] min-h-px min-w-px relative shrink-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[60px] relative w-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[60px] left-0 text-[60px] text-black text-nowrap top-[-6px] whitespace-pre">30</p>
      </div>
    </div>
  );
}

function Icon1() {
  return (
    <div className="relative shrink-0 size-[48px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 48 48">
        <g id="Icon">
          <path d="M24 10V38" id="Vector" stroke="var(--stroke-0, #C63434)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="6" />
          <path d="M38 24L24 38L10 24" id="Vector_2" stroke="var(--stroke-0, #C63434)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="6" />
        </g>
      </svg>
    </div>
  );
}

function Container1() {
  return (
    <div className="h-[60px] relative shrink-0 w-[120.688px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex gap-[8px] h-[60px] items-center relative w-[120.688px]">
        <Text />
        <Icon1 />
      </div>
    </div>
  );
}

function Heading1() {
  return (
    <div className="h-[27px] relative shrink-0 w-full" data-name="Heading 3">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[27px] left-0 text-[18px] text-black text-nowrap top-[-1.5px] whitespace-pre">Applicants</p>
    </div>
  );
}

function Paragraph() {
  return (
    <div className="h-[24px] relative shrink-0 w-full" data-name="Paragraph">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#aaaaaa] text-[16px] text-nowrap top-[-2px] whitespace-pre">in the last 30 days</p>
    </div>
  );
}

function Container2() {
  return (
    <div className="basis-0 grow h-[55px] min-h-px min-w-px relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex flex-col gap-[4px] h-[55px] items-start relative w-full">
        <Heading1 />
        <Paragraph />
      </div>
    </div>
  );
}

function Container3() {
  return (
    <div className="h-[60px] relative shrink-0 w-[376px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex gap-[16px] h-[60px] items-center relative w-[376px]">
        <Container1 />
        <Container2 />
      </div>
    </div>
  );
}

function StatCard() {
  return (
    <div className="[grid-area:1_/_1] bg-[#fefefe] relative rounded-[16px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] shrink-0" data-name="StatCard">
      <div className="flex flex-col justify-center size-full">
        <div className="box-border content-stretch flex flex-col items-start justify-center pl-[32px] pr-0 py-0 relative size-full">
          <Container3 />
        </div>
      </div>
    </div>
  );
}

function Text1() {
  return (
    <div className="h-[60px] relative shrink-0 w-[32.344px]" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[60px] relative w-[32.344px]">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[60px] left-0 text-[60px] text-black text-nowrap top-[-6px] whitespace-pre">3</p>
      </div>
    </div>
  );
}

function Icon2() {
  return (
    <div className="basis-0 grow h-[48px] min-h-px min-w-px relative shrink-0" data-name="Icon">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[48px] overflow-clip relative rounded-[inherit] w-full">
        <div className="absolute bottom-1/2 left-[20.83%] right-[20.83%] top-[20.83%]" data-name="Vector">
          <div className="absolute inset-[-21.43%_-10.71%]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 34 20">
              <path d="M3 17L17 3L31 17" id="Vector" stroke="var(--stroke-0, #18BA84)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="6" />
            </svg>
          </div>
        </div>
        <div className="absolute bottom-[20.83%] left-1/2 right-1/2 top-[20.83%]" data-name="Vector">
          <div className="absolute inset-[-10.71%_-3px]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 6 34">
              <path d="M3 31V3" id="Vector" stroke="var(--stroke-0, #18BA84)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function Container4() {
  return (
    <div className="h-[60px] relative shrink-0 w-[88.344px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex gap-[8px] h-[60px] items-center relative w-[88.344px]">
        <Text1 />
        <Icon2 />
      </div>
    </div>
  );
}

function Heading2() {
  return (
    <div className="h-[27px] relative shrink-0 w-full" data-name="Heading 3">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[27px] left-0 text-[18px] text-black text-nowrap top-[-1.5px] whitespace-pre">Perfect Match</p>
    </div>
  );
}

function Paragraph1() {
  return (
    <div className="h-[24px] relative shrink-0 w-full" data-name="Paragraph">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#aaaaaa] text-[16px] text-nowrap top-[-2px] whitespace-pre">on the last 24 hours</p>
    </div>
  );
}

function Container5() {
  return (
    <div className="basis-0 grow h-[55px] min-h-px min-w-px relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex flex-col gap-[4px] h-[55px] items-start relative w-full">
        <Heading2 />
        <Paragraph1 />
      </div>
    </div>
  );
}

function Container6() {
  return (
    <div className="h-[60px] relative shrink-0 w-[376px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex gap-[16px] h-[60px] items-center relative w-[376px]">
        <Container4 />
        <Container5 />
      </div>
    </div>
  );
}

function StatCard1() {
  return (
    <div className="[grid-area:1_/_2] bg-[#fefefe] relative rounded-[16px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] shrink-0" data-name="StatCard">
      <div className="flex flex-col justify-center size-full">
        <div className="box-border content-stretch flex flex-col items-start justify-center pl-[32px] pr-0 py-0 relative size-full">
          <Container6 />
        </div>
      </div>
    </div>
  );
}

function Text2() {
  return (
    <div className="h-[60px] relative shrink-0 w-[32.344px]" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[60px] relative w-[32.344px]">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[60px] left-0 text-[60px] text-black text-nowrap top-[-6px] whitespace-pre">1</p>
      </div>
    </div>
  );
}

function Heading3() {
  return (
    <div className="h-[27px] relative shrink-0 w-full" data-name="Heading 3">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[27px] left-0 text-[18px] text-black text-nowrap top-[-1.5px] whitespace-pre">Suspicious assessment</p>
    </div>
  );
}

function Paragraph2() {
  return (
    <div className="h-[24px] relative shrink-0 w-full" data-name="Paragraph">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#aaaaaa] text-[16px] text-nowrap top-[-2px] whitespace-pre">awaiting review</p>
    </div>
  );
}

function Container7() {
  return (
    <div className="basis-0 grow h-[55px] min-h-px min-w-px relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex flex-col gap-[4px] h-[55px] items-start relative w-full">
        <Heading3 />
        <Paragraph2 />
      </div>
    </div>
  );
}

function Container8() {
  return (
    <div className="absolute content-stretch flex gap-[16px] h-[60px] items-center left-[32px] top-[32px] w-[376px]" data-name="Container">
      <Text2 />
      <Container7 />
    </div>
  );
}

function Button2() {
  return (
    <div className="absolute h-[24px] left-[337.71px] top-[116px] w-[70.289px]" data-name="Button">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[35.5px] text-[#9f9f9f] text-[16px] text-center text-nowrap top-[-2px] translate-x-[-50%] whitespace-pre">{`Check >>`}</p>
    </div>
  );
}

function StatCard2() {
  return (
    <div className="[grid-area:1_/_3] bg-[#fefefe] relative rounded-[16px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] shrink-0" data-name="StatCard">
      <Container8 />
      <Button2 />
    </div>
  );
}

function Container9() {
  return (
    <div className="gap-[24px] grid grid-cols-[repeat(3,_minmax(0px,_1fr))] grid-rows-[repeat(1,_minmax(0px,_1fr))] h-[172px] relative shrink-0 w-full" data-name="Container">
      <StatCard />
      <StatCard1 />
      <StatCard2 />
    </div>
  );
}

function Heading() {
  return (
    <div className="h-[30px] relative shrink-0 w-[149.602px]" data-name="Heading 2">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[30px] relative w-[149.602px]">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[30px] left-0 text-[20px] text-black text-nowrap top-[-2.5px] whitespace-pre">Opened Projects</p>
      </div>
    </div>
  );
}

function Button3() {
  return (
    <div className="h-[24px] relative shrink-0 w-[56.156px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-[56.156px]">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[28.5px] text-[#9f9f9f] text-[16px] text-center text-nowrap top-[-2px] translate-x-[-50%] whitespace-pre">View all</p>
      </div>
    </div>
  );
}

function Container10() {
  return (
    <div className="content-stretch flex h-[30px] items-center justify-between relative shrink-0 w-full" data-name="Container">
      <Heading />
      <Button3 />
    </div>
  );
}

function Heading4() {
  return (
    <div className="basis-0 grow h-[24px] min-h-px min-w-px relative shrink-0" data-name="Heading 3">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[16px] text-black text-nowrap top-[-2px] whitespace-pre">Summer Internship</p>
      </div>
    </div>
  );
}

function Text3() {
  return (
    <div className="h-[24px] relative shrink-0 w-[46.977px]" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-[46.977px]">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#9f9f9f] text-[16px] top-[-2px] w-[47px]">3 roles</p>
      </div>
    </div>
  );
}

function Text4() {
  return (
    <div className="basis-0 grow h-[24px] min-h-px min-w-px relative shrink-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#aaaaaa] text-[16px] top-[-2px] w-[102px]">999 applicants</p>
      </div>
    </div>
  );
}

function Container11() {
  return (
    <div className="h-[24px] relative shrink-0 w-[180.734px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex gap-[32px] h-[24px] items-center relative w-[180.734px]">
        <Text3 />
        <Text4 />
      </div>
    </div>
  );
}

function Button4() {
  return (
    <div className="bg-[#4834ab] h-[40px] relative rounded-[10px] shrink-0 w-[81.742px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[40px] relative w-[81.742px]">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[41.5px] text-[16px] text-center text-nowrap text-white top-[6px] translate-x-[-50%] whitespace-pre">View</p>
      </div>
    </div>
  );
}

function ProjectCard() {
  return (
    <div className="bg-[#f7fafe] h-[88px] relative rounded-[14px] shrink-0 w-full" data-name="ProjectCard">
      <div className="flex flex-row items-center size-full">
        <div className="box-border content-stretch flex h-[88px] items-center justify-between px-[24px] py-0 relative w-full">
          <Heading4 />
          <Container11 />
          <Button4 />
        </div>
      </div>
    </div>
  );
}

function Heading5() {
  return (
    <div className="basis-0 grow h-[24px] min-h-px min-w-px relative shrink-0" data-name="Heading 3">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[16px] text-black text-nowrap top-[-2px] whitespace-pre">Software Engineering II (DevOps Team)</p>
      </div>
    </div>
  );
}

function Text5() {
  return (
    <div className="h-[24px] relative shrink-0 w-[40.188px]" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-[40.188px]">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#9f9f9f] text-[16px] top-[-2px] w-[41px]">1 role</p>
      </div>
    </div>
  );
}

function Text6() {
  return (
    <div className="basis-0 grow h-[24px] min-h-px min-w-px relative shrink-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#aaaaaa] text-[16px] top-[-2px] w-[94px]">30 applicants</p>
      </div>
    </div>
  );
}

function Container12() {
  return (
    <div className="h-[24px] relative shrink-0 w-[165.32px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex gap-[32px] h-[24px] items-center relative w-[165.32px]">
        <Text5 />
        <Text6 />
      </div>
    </div>
  );
}

function Button5() {
  return (
    <div className="bg-[#4834ab] h-[40px] relative rounded-[10px] shrink-0 w-[81.742px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[40px] relative w-[81.742px]">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[41.5px] text-[16px] text-center text-nowrap text-white top-[6px] translate-x-[-50%] whitespace-pre">View</p>
      </div>
    </div>
  );
}

function ProjectCard1() {
  return (
    <div className="bg-[#f7fafe] h-[88px] relative rounded-[14px] shrink-0 w-full" data-name="ProjectCard">
      <div className="flex flex-row items-center size-full">
        <div className="box-border content-stretch flex h-[88px] items-center justify-between px-[24px] py-0 relative w-full">
          <Heading5 />
          <Container12 />
          <Button5 />
        </div>
      </div>
    </div>
  );
}

function Heading6() {
  return (
    <div className="basis-0 grow h-[24px] min-h-px min-w-px relative shrink-0" data-name="Heading 3">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[16px] text-black text-nowrap top-[-2px] whitespace-pre">Product Migration Project</p>
      </div>
    </div>
  );
}

function Text7() {
  return (
    <div className="h-[24px] relative shrink-0 w-[46.977px]" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-[46.977px]">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#9f9f9f] text-[16px] top-[-2px] w-[47px]">7 roles</p>
      </div>
    </div>
  );
}

function Text8() {
  return (
    <div className="basis-0 grow h-[24px] min-h-px min-w-px relative shrink-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#aaaaaa] text-[16px] top-[-2px] w-[102px]">100 applicants</p>
      </div>
    </div>
  );
}

function Container13() {
  return (
    <div className="h-[24px] relative shrink-0 w-[180.734px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex gap-[32px] h-[24px] items-center relative w-[180.734px]">
        <Text7 />
        <Text8 />
      </div>
    </div>
  );
}

function Button6() {
  return (
    <div className="bg-[#4834ab] h-[40px] relative rounded-[10px] shrink-0 w-[81.742px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[40px] relative w-[81.742px]">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[41.5px] text-[16px] text-center text-nowrap text-white top-[6px] translate-x-[-50%] whitespace-pre">View</p>
      </div>
    </div>
  );
}

function ProjectCard2() {
  return (
    <div className="bg-[#f7fafe] h-[88px] relative rounded-[14px] shrink-0 w-full" data-name="ProjectCard">
      <div className="flex flex-row items-center size-full">
        <div className="box-border content-stretch flex h-[88px] items-center justify-between px-[24px] py-0 relative w-full">
          <Heading6 />
          <Container13 />
          <Button6 />
        </div>
      </div>
    </div>
  );
}

function Heading7() {
  return (
    <div className="basis-0 grow h-[24px] min-h-px min-w-px relative shrink-0" data-name="Heading 3">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[16px] text-black text-nowrap top-[-2px] whitespace-pre">AI team</p>
      </div>
    </div>
  );
}

function Text9() {
  return (
    <div className="h-[24px] relative shrink-0 w-[46.977px]" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-[46.977px]">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#9f9f9f] text-[16px] top-[-2px] w-[47px]">3 roles</p>
      </div>
    </div>
  );
}

function Text10() {
  return (
    <div className="basis-0 grow h-[24px] min-h-px min-w-px relative shrink-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] relative w-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#aaaaaa] text-[16px] top-[-2px] w-[102px]">100 applicants</p>
      </div>
    </div>
  );
}

function Container14() {
  return (
    <div className="h-[24px] relative shrink-0 w-[180.734px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex gap-[32px] h-[24px] items-center relative w-[180.734px]">
        <Text9 />
        <Text10 />
      </div>
    </div>
  );
}

function Button7() {
  return (
    <div className="bg-[#4834ab] h-[40px] relative rounded-[10px] shrink-0 w-[81.742px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[40px] relative w-[81.742px]">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[41.5px] text-[16px] text-center text-nowrap text-white top-[6px] translate-x-[-50%] whitespace-pre">View</p>
      </div>
    </div>
  );
}

function ProjectCard3() {
  return (
    <div className="bg-[#f7fafe] h-[88px] relative rounded-[14px] shrink-0 w-full" data-name="ProjectCard">
      <div className="flex flex-row items-center size-full">
        <div className="box-border content-stretch flex h-[88px] items-center justify-between px-[24px] py-0 relative w-full">
          <Heading7 />
          <Container14 />
          <Button7 />
        </div>
      </div>
    </div>
  );
}

function Container15() {
  return (
    <div className="bg-[#fefefe] h-[464px] relative rounded-[16px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] shrink-0 w-full" data-name="Container">
      <div className="size-full">
        <div className="box-border content-stretch flex flex-col gap-[16px] h-[464px] items-start pb-0 pt-[32px] px-[32px] relative w-full">
          <ProjectCard />
          <ProjectCard1 />
          <ProjectCard2 />
          <ProjectCard3 />
        </div>
      </div>
    </div>
  );
}

function Container16() {
  return (
    <div className="content-stretch flex flex-col gap-[24px] h-[518px] items-start relative shrink-0 w-full" data-name="Container">
      <Container10 />
      <Container15 />
    </div>
  );
}

function MainContent() {
  return (
    <div className="h-[802px] relative shrink-0 w-full" data-name="Main Content">
      <div className="size-full">
        <div className="box-border content-stretch flex flex-col gap-[48px] h-[802px] items-start pb-0 pt-[32px] px-[32px] relative w-full">
          <Container9 />
          <Container16 />
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="absolute bg-[#edf0f8] box-border content-stretch flex flex-col h-[892px] items-start left-0 pl-[96px] pr-0 py-0 top-0 w-[1528px]" data-name="App">
      <Header />
      <MainContent />
    </div>
  );
}

function Text11() {
  return (
    <div className="absolute h-[24px] left-0 top-[-20000px] w-[8.625px]" data-name="Text">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[16px] text-neutral-950 text-nowrap top-[-2px] whitespace-pre">0</p>
    </div>
  );
}

function Icon3() {
  return (
    <div className="relative shrink-0 size-[32px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
        <g id="Icon">
          <path d={svgPaths.p3b973d80} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <path d={svgPaths.p2b93c800} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Text12() {
  return (
    <div className="h-[24px] relative shrink-0 w-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] overflow-clip relative rounded-[inherit] w-0">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[21.5px] text-[#4834ab] text-[16px] text-center text-nowrap top-[-2px] translate-x-[-50%] whitespace-pre">Home</p>
      </div>
    </div>
  );
}

function Button8() {
  return (
    <div className="bg-[#dad3ff] relative rounded-[24px] shrink-0 size-[64px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex items-center justify-center relative size-[64px]">
        <Icon3 />
        <Text12 />
      </div>
    </div>
  );
}

function Icon4() {
  return (
    <div className="relative shrink-0 size-[32px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
        <g id="Icon">
          <path d={svgPaths.p984d200} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <path d={svgPaths.p28e98400} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Text13() {
  return (
    <div className="h-[24px] relative shrink-0 w-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] overflow-clip relative rounded-[inherit] w-0">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[28px] text-[#4834ab] text-[16px] text-center text-nowrap top-[-2px] translate-x-[-50%] whitespace-pre">Projects</p>
      </div>
    </div>
  );
}

function Button9() {
  return (
    <div className="relative rounded-[24px] shrink-0 size-[64px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex items-center justify-center relative size-[64px]">
        <Icon4 />
        <Text13 />
      </div>
    </div>
  );
}

function Icon5() {
  return (
    <div className="relative shrink-0 size-[32px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
        <g id="Icon">
          <path d={svgPaths.p27a3200} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <path d={svgPaths.p2db021c0} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <path d={svgPaths.p18f42980} id="Vector_3" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <path d={svgPaths.p2ee517c0} id="Vector_4" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Text14() {
  return (
    <div className="h-[24px] relative shrink-0 w-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] overflow-clip relative rounded-[inherit] w-0">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[39px] text-[#4834ab] text-[16px] text-center text-nowrap top-[-2px] translate-x-[-50%] whitespace-pre">Candidates</p>
      </div>
    </div>
  );
}

function Button10() {
  return (
    <div className="relative rounded-[24px] shrink-0 size-[64px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex items-center justify-center relative size-[64px]">
        <Icon5 />
        <Text14 />
      </div>
    </div>
  );
}

function Icon6() {
  return (
    <div className="relative shrink-0 size-[32px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
        <g id="Icon">
          <path d={svgPaths.p2394b748} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <path d={svgPaths.p34392700} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Text15() {
  return (
    <div className="h-[24px] relative shrink-0 w-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border h-[24px] overflow-clip relative rounded-[inherit] w-0">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[28px] text-[#4834ab] text-[16px] text-center text-nowrap top-[-2px] translate-x-[-50%] whitespace-pre">Settings</p>
      </div>
    </div>
  );
}

function Button11() {
  return (
    <div className="relative rounded-[24px] shrink-0 size-[64px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid box-border content-stretch flex items-center justify-center relative size-[64px]">
        <Icon6 />
        <Text15 />
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <div className="absolute bg-[#f7fafe] content-stretch flex flex-col gap-[16px] h-[874px] items-center justify-center left-0 rounded-br-[24px] rounded-tr-[24px] top-0 w-[96px]" data-name="Sidebar">
      <Button8 />
      <Button9 />
      <Button10 />
      <Button11 />
    </div>
  );
}

export default function ImplementUiWithColorPalette() {
  return (
    <div className="bg-white relative size-full" data-name="Implement UI with Color Palette">
      <App />
      <Text11 />
      <Sidebar />
    </div>
  );
}